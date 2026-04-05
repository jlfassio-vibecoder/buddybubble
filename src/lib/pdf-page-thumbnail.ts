/**
 * Browser-only: render PDF page 1 to a JPEG for message attachment thumbnails.
 */
import { getDocument, GlobalWorkerOptions, version } from 'pdfjs-dist';

GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;

export const PDF_THUMB_MAX_WIDTH = 320;
const JPEG_QUALITY = 0.82;
const MAX_BYTES = 2 * 1024 * 1024;

export type PdfThumbResult = {
  blob: Blob;
  width: number;
  height: number;
};

function isPdfFile(file: File): boolean {
  const t = file.type.toLowerCase();
  return t === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export async function renderPdfFirstPageToJpegBlob(file: File): Promise<PdfThumbResult> {
  if (!isPdfFile(file)) {
    throw new Error('Not a PDF file.');
  }
  const buf = await file.arrayBuffer();
  const loadingTask = getDocument({ data: buf });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const maxDim = Math.max(base.width, base.height);
  const scale = Math.min(1, PDF_THUMB_MAX_WIDTH / maxDim);
  const viewport = page.getViewport({ scale });
  const w = Math.max(1, Math.ceil(viewport.width));
  const h = Math.max(1, Math.ceil(viewport.height));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create canvas.');
  const renderTask = page.render({ canvasContext: ctx, viewport });
  await renderTask.promise;

  let q = JPEG_QUALITY;
  let blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', q),
  );
  if (!blob) throw new Error('Could not encode PDF thumbnail.');
  while (blob.size > MAX_BYTES && q > 0.45) {
    q -= 0.1;
    blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', q));
    if (!blob) throw new Error('Could not encode PDF thumbnail.');
  }
  if (blob.size > MAX_BYTES) {
    throw new Error('PDF thumbnail is too large.');
  }

  return { blob, width: w, height: h };
}
