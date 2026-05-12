-- Widen class_recording_sessions.agora_uid from integer to bigint.
-- Agora UIDs are unsigned 32-bit (up to ~4.29B) which overflows int4 (max ~2.15B);
-- bigint (int8) safely holds the full range. The cloud DB was altered manually;
-- this forward-only migration keeps local/staging/CI environments in sync.

ALTER TABLE public.class_recording_sessions
ALTER COLUMN agora_uid TYPE bigint USING agora_uid::bigint;
