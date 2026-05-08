/**
 * Capture structured JSON log lines emitted by `_shared/obs/log.ts` in Deno
 * integration tests. Non-agent log lines are retained as raw strings for
 * troubleshooting but excluded from phase assertions.
 */

export type CapturedAgentLog = {
  ts?: string;
  ns?: string;
  level?: string;
  msg?: string;
  phase?: string;
  [key: string]: unknown;
};

export type LogCapture = {
  readonly logs: CapturedAgentLog[];
  readonly rawLines: string[];
  restore: () => void;
  findLog: (predicate: (log: CapturedAgentLog) => boolean) => CapturedAgentLog | undefined;
  phaseSequence: () => string[];
};

export function captureAgentLogs(): LogCapture {
  const original = console.log;
  const logs: CapturedAgentLog[] = [];
  const rawLines: string[] = [];

  console.log = (...args: unknown[]) => {
    const line = args.map((arg) => (typeof arg === 'string' ? arg : String(arg))).join(' ');
    rawLines.push(line);
    try {
      const parsed = JSON.parse(line) as CapturedAgentLog;
      if (parsed?.ns === 'agent-dispatch') {
        logs.push(parsed);
      }
    } catch {
      // Ignore non-JSON output; keep it in rawLines for debugging failed tests.
    }
  };

  return {
    logs,
    rawLines,
    restore: () => {
      console.log = original;
    },
    findLog: (predicate) => logs.find(predicate),
    phaseSequence: () =>
      logs.map((log) => (typeof log.phase === 'string' ? log.phase : '')).filter(Boolean),
  };
}
