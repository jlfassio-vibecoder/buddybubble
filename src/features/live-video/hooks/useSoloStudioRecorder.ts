'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { createClient } from '@utils/supabase/client';
import {
  assembleRecorderBlob,
  buildSoloStudioMixedStream,
  pickMediaRecorderMimeType,
} from '@/lib/live-video/solo-studio-recorder';
import {
  markSoloStudioRecordingStarted,
  uploadSoloStudioRecording,
} from '@/lib/live-video/upload-solo-studio-recording';

export type SoloStudioRecorderStatus =
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'uploading'
  | 'ready'
  | 'failed';

export type UseSoloStudioRecorderArgs = {
  workspaceId: string;
  classInstanceId: string;
  enabled: boolean;
};

export type UseSoloStudioRecorderResult = {
  status: SoloStudioRecorderStatus;
  errorMessage: string | null;
  isBusy: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
};

type CaptureRefs = {
  displayStream: MediaStream | null;
  micStream: MediaStream | null;
  mixedCleanup: (() => void) | null;
  recorder: MediaRecorder | null;
  chunks: Blob[];
  mimeType: string;
};

function createEmptyCaptureRefs(): CaptureRefs {
  return {
    displayStream: null,
    micStream: null,
    mixedCleanup: null,
    recorder: null,
    chunks: [],
    mimeType: '',
  };
}

/**
 * Solo Studio browser recorder: getDisplayMedia + optional mic mix → MediaRecorder → upload.
 */
export function useSoloStudioRecorder({
  workspaceId,
  classInstanceId,
  enabled,
}: UseSoloStudioRecorderArgs): UseSoloStudioRecorderResult {
  const [status, setStatus] = useState<SoloStudioRecorderStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  const captureRef = useRef<CaptureRefs>(createEmptyCaptureRefs());
  const supabaseRef = useRef(createClient());
  const uploadInFlightRef = useRef(false);
  const emergencyUploadBlobRef = useRef<(blob: Blob) => void>(() => {});
  /** Bumped to invalidate an in-flight start after getDisplayMedia returns. */
  const startGenerationRef = useRef(0);

  const cleanupCapture = useCallback(() => {
    const c = captureRef.current;
    c.recorder = null;
    c.mixedCleanup?.();
    c.mixedCleanup = null;
    c.displayStream = null;
    c.micStream = null;
    c.chunks = [];
    c.mimeType = '';
  }, []);

  /** Invalidate in-flight start (share picker still open or just resolved after End/Exit). */
  const cancelInFlightStart = useCallback(() => {
    startGenerationRef.current += 1;
    if (statusRef.current === 'requesting') {
      cleanupCapture();
      setStatus('idle');
      setErrorMessage(null);
    }
  }, [cleanupCapture]);

  const runUpload = useCallback(
    async (blob: Blob) => {
      if (uploadInFlightRef.current) return;
      uploadInFlightRef.current = true;
      setStatus('uploading');
      setErrorMessage(null);

      try {
        const result = await uploadSoloStudioRecording({
          supabase: supabaseRef.current,
          workspaceId,
          classInstanceId,
          blob,
        });

        if (result.ok) {
          setStatus('ready');
          toast.success('Studio recording uploaded');
        } else {
          setStatus('failed');
          setErrorMessage(result.error);
          toast.error(result.error);
        }
      } finally {
        uploadInFlightRef.current = false;
      }
    },
    [workspaceId, classInstanceId],
  );

  /** Emergency path (pagehide / unmount): same in-flight lock as manual stop → runUpload. */
  const emergencyUploadBlob = useCallback(
    (blob: Blob) => {
      if (blob.size <= 0 || uploadInFlightRef.current) return;
      uploadInFlightRef.current = true;
      void uploadSoloStudioRecording({
        supabase: supabaseRef.current,
        workspaceId,
        classInstanceId,
        blob,
      }).finally(() => {
        uploadInFlightRef.current = false;
      });
    },
    [workspaceId, classInstanceId],
  );
  emergencyUploadBlobRef.current = emergencyUploadBlob;

  const stopRecordingInternal = useCallback(async () => {
    const c = captureRef.current;
    const recorder = c.recorder;

    if (!recorder || (recorder.state !== 'recording' && recorder.state !== 'paused')) {
      if (statusRef.current === 'recording') {
        setStatus('idle');
      }
      cleanupCapture();
      return;
    }

    const blob = await new Promise<Blob>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        const assembled = assembleRecorderBlob(c.chunks, c.mimeType);
        cleanupCapture();
        resolve(assembled);
      };

      recorder.onstop = () => {
        finish();
      };
      try {
        recorder.requestData();
      } catch {
        /* ignore */
      }
      try {
        recorder.stop();
      } catch {
        finish();
      }
    });

    if (blob.size > 0) {
      await runUpload(blob);
    } else {
      setStatus('failed');
      setErrorMessage('Recording is empty.');
      toast.error('Recording is empty. Try again.');
    }
  }, [cleanupCapture, runUpload]);

  const startRecording = useCallback(async () => {
    if (!enabled) return;
    const current = statusRef.current;
    if (
      current === 'requesting' ||
      current === 'recording' ||
      current === 'uploading' ||
      uploadInFlightRef.current
    ) {
      return;
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getDisplayMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setStatus('failed');
      setErrorMessage('Screen recording is not supported in this browser.');
      toast.error('Screen recording is not supported in this browser.');
      return;
    }

    setStatus('requesting');
    setErrorMessage(null);
    cleanupCapture();
    const generation = ++startGenerationRef.current;

    let display: MediaStream | null = null;
    let mic: MediaStream | null = null;

    const abandonIfCancelled = (): boolean => {
      if (generation === startGenerationRef.current) return false;
      if (display) {
        for (const t of display.getTracks()) t.stop();
      }
      if (mic) {
        for (const t of mic.getTracks()) t.stop();
      }
      return true;
    };

    try {
      // Prefer tab/system audio when the browser supports it; fall back to video-only.
      try {
        display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      } catch (withAudioErr) {
        const name =
          withAudioErr instanceof DOMException
            ? withAudioErr.name
            : withAudioErr instanceof Error
              ? withAudioErr.name
              : '';
        // User dismissed the picker or blocked permission — do not retry.
        if (name === 'NotAllowedError' || name === 'AbortError') {
          throw withAudioErr;
        }
        if (process.env.NODE_ENV === 'development') {
          console.warn(
            '[useSoloStudioRecorder] getDisplayMedia(audio:true) failed; retrying video-only',
            name,
            withAudioErr instanceof Error ? withAudioErr.message : withAudioErr,
          );
        }
        display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      }
    } catch (e) {
      if (abandonIfCancelled()) return;
      const name = e instanceof DOMException ? e.name : e instanceof Error ? e.name : '';
      const detail = e instanceof Error ? e.message : String(e);
      if (process.env.NODE_ENV === 'development') {
        console.warn('[useSoloStudioRecorder] getDisplayMedia failed', name, detail);
      }
      let msg = 'Could not start screen capture.';
      if (name === 'NotAllowedError') {
        msg = 'Screen share permission was denied.';
      } else if (name === 'AbortError') {
        // User cancelled the browser share picker — not a hard failure.
        msg = 'Screen share cancelled.';
        setStatus('idle');
        setErrorMessage(null);
        toast.message(msg, {
          description: 'Click Record again and choose this tab (include audio if offered).',
        });
        return;
      } else if (name === 'NotSupportedError' || name === 'NotFoundError') {
        msg = 'Screen capture is not available in this browser or display.';
      } else if (detail && detail !== msg) {
        msg = `Could not start screen capture (${name || 'error'}).`;
      }
      setStatus('failed');
      setErrorMessage(msg);
      toast.error(msg);
      return;
    }

    if (abandonIfCancelled()) return;

    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      mic = null;
      if (generation === startGenerationRef.current) {
        toast.message('Microphone unavailable', {
          description: 'Recording will continue with tab audio only (if shared).',
        });
      }
    }

    if (abandonIfCancelled()) return;

    let mixedCleanup: (() => void) | null = null;
    let mixedStream: MediaStream;
    try {
      const mixed = buildSoloStudioMixedStream(display, mic);
      mixedStream = mixed.stream;
      mixedCleanup = mixed.cleanup;
    } catch (e) {
      for (const t of display.getTracks()) t.stop();
      if (mic) for (const t of mic.getTracks()) t.stop();
      if (abandonIfCancelled()) return;
      const msg = e instanceof Error ? e.message : 'Could not build recording stream.';
      setStatus('failed');
      setErrorMessage(msg);
      toast.error(msg);
      return;
    }

    if (abandonIfCancelled()) {
      mixedCleanup();
      return;
    }

    const mimeType = pickMediaRecorderMimeType();
    const recorder = mimeType
      ? new MediaRecorder(mixedStream, { mimeType })
      : new MediaRecorder(mixedStream);

    const c = captureRef.current;
    c.displayStream = display;
    c.micStream = mic;
    c.mixedCleanup = mixedCleanup;
    c.recorder = recorder;
    c.chunks = [];
    c.mimeType = recorder.mimeType || mimeType || 'video/webm';

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        captureRef.current.chunks.push(ev.data);
      }
    };

    const videoTrack = display.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.addEventListener('ended', () => {
        if (statusRef.current === 'recording') {
          void stopRecordingInternal();
        }
      });
    }

    const marked = await markSoloStudioRecordingStarted(supabaseRef.current, classInstanceId);
    if (abandonIfCancelled()) {
      mixedCleanup();
      cleanupCapture();
      return;
    }
    if (!marked.ok) {
      mixedCleanup();
      cleanupCapture();
      setStatus('failed');
      setErrorMessage(marked.error);
      toast.error(marked.error);
      return;
    }

    try {
      recorder.start(1000);
      if (abandonIfCancelled()) {
        try {
          recorder.stop();
        } catch {
          /* ignore */
        }
        mixedCleanup();
        cleanupCapture();
        return;
      }
      setStatus('recording');
    } catch (e) {
      mixedCleanup();
      cleanupCapture();
      if (abandonIfCancelled()) return;
      const msg = e instanceof Error ? e.message : 'Could not start MediaRecorder.';
      setStatus('failed');
      setErrorMessage(msg);
      toast.error(msg);
    }
  }, [enabled, classInstanceId, cleanupCapture, stopRecordingInternal]);

  const stopRecording = useCallback(async () => {
    if (statusRef.current === 'requesting') {
      cancelInFlightStart();
      return;
    }
    if (statusRef.current !== 'recording') {
      return;
    }
    await stopRecordingInternal();
  }, [cancelInFlightStart, stopRecordingInternal]);

  // beforeunload warn while recording
  useEffect(() => {
    if (status !== 'recording') return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [status]);

  // pagehide best-effort stop + upload
  useEffect(() => {
    const onPageHide = () => {
      if (statusRef.current !== 'recording') return;
      const c = captureRef.current;
      const recorder = c.recorder;
      if (recorder && recorder.state === 'recording') {
        try {
          recorder.requestData();
          recorder.stop();
        } catch {
          /* ignore */
        }
      }
      // Copilot suggestion ignored: pagehide cannot reliably await MediaRecorder onstop/ondataavailable before unload; requestData+current chunks is best-effort by design.
      const blob = assembleRecorderBlob(c.chunks, c.mimeType);
      c.mixedCleanup?.();
      emergencyUploadBlobRef.current(blob);
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

  // Disable: cancel in-flight start or stop+upload an active recording.
  useEffect(() => {
    if (enabled) return;
    if (statusRef.current === 'requesting') {
      cancelInFlightStart();
      return;
    }
    if (statusRef.current === 'recording') {
      void stopRecordingInternal();
    }
  }, [enabled, cancelInFlightStart, stopRecordingInternal]);

  useEffect(() => {
    return () => {
      startGenerationRef.current += 1;
      // Do not upload here — SPA leave uses stopRecordingInternal via enabled=false or SessionControls;
      // hard navigation uses pagehide. Sync assemble+upload on unmount raced and truncated blobs.
      if (statusRef.current === 'recording' || statusRef.current === 'requesting') {
        captureRef.current.mixedCleanup?.();
        captureRef.current.mixedCleanup = null;
      } else {
        captureRef.current.mixedCleanup?.();
      }
    };
  }, []);

  const isBusy = status === 'requesting' || status === 'recording' || status === 'uploading';

  return {
    status,
    errorMessage,
    isBusy,
    startRecording,
    stopRecording,
  };
}
