/**
 * Single JSON-line structured logger for the consolidated agent dispatcher.
 *
 * Emits one line per call via `console.log` so Supabase Edge log shipping picks each up
 * as an individual record. The shape is the `LogFields` contract from
 * `docs/refactor/vertex-agent-dispatch-consolidation/phase-1-shared-foundations.md`.
 *
 * Pure module — no Deno globals, no env reads, safe to import from `deno test`.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Phases the dispatcher transitions through; keeps log filters consistent. */
export type DispatchPhase =
  | 'received'
  | 'routed'
  | 'preflight'
  | 'llm_call'
  | 'llm_done'
  | 'parsed'
  | 'enriched'
  | 'guarded'
  | 'persisted'
  | 'fallback'
  | 'done';

/**
 * Structured fields attached to each log line. All keys are optional except those
 * filled in by the caller for that specific log site; the dispatcher composes them
 * incrementally (request_id at entry, slug after routing, etc.).
 */
export type LogFields = {
  request_id?: string;
  slug?: string;
  message_id?: string;
  bubble_id?: string;
  phase?: DispatchPhase;
  model?: string;
  latency_ms?: number;
  http_status?: number;
  retry_count?: number;
  token_in?: number;
  token_out?: number;
  error_kind?: string;
  /** Free-form extensions the dispatcher or strategies may attach. */
  [key: string]: unknown;
};

const LOG_NAMESPACE = 'agent-dispatch';

/**
 * Emit one structured JSON line. Never throws; on serialization failure falls back to a
 * minimal stringified form so a logging bug cannot mask the underlying dispatch error.
 */
export function log(level: LogLevel, msg: string, fields: LogFields = {}): void {
  const record = {
    ts: new Date().toISOString(),
    ns: LOG_NAMESPACE,
    level,
    msg,
    ...fields,
  };
  let line: string;
  try {
    line = JSON.stringify(record);
  } catch {
    line = JSON.stringify({
      ts: record.ts,
      ns: LOG_NAMESPACE,
      level,
      msg,
      log_serialize_error: true,
    });
  }
  console.log(line);
}
