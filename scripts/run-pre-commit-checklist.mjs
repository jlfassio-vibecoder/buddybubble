#!/usr/bin/env node
/**
 * Runs docs/pre-commit-checklist.md as discrete steps, writing compact progress to:
 *   tmp/pre-commit-checklist-status.json  (machine-readable)
 *   tmp/pre-commit-checklist.log          (full step output)
 *
 * Designed for Cursor agents: fire-and-forget (`block_until_ms: 0`), then read the
 * status file — never await the full multi-minute gate in-chat.
 *
 * Usage:
 *   node scripts/run-pre-commit-checklist.mjs
 *   node scripts/run-pre-commit-checklist.mjs --with-storefront
 *   pnpm run check:report
 *   pnpm run check:report -- --with-storefront
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'tmp');
const statusPath = path.join(outDir, 'pre-commit-checklist-status.json');
const logPath = path.join(outDir, 'pre-commit-checklist.log');

const argv = process.argv.slice(2);
const withStorefront = argv.includes('--with-storefront') || argv.includes('--verify-storefront');

/** @type {{ id: string; args: string[] }[]} */
const steps = [
  { id: 'format:check', args: ['run', 'format:check'] },
  { id: 'lint', args: ['run', 'lint'] },
  { id: 'check:agent-coupling', args: ['run', 'check:agent-coupling'] },
  { id: 'check:agent-prompts', args: ['run', 'check:agent-prompts'] },
  { id: 'check:agent-mirror', args: ['run', 'check:agent-mirror'] },
  // Errors only — warnings do not fail the gate and flood agent terminals (~300KB).
  { id: 'lint:eslint:errors', args: ['run', 'lint:eslint:errors'] },
  { id: 'test:deno-integration', args: ['run', 'test:deno-integration'] },
  { id: 'build', args: ['run', 'build'] },
  { id: 'check:storefront', args: ['run', 'check:storefront'] },
];

if (withStorefront) {
  steps.push({ id: 'build:storefront', args: ['run', 'build:storefront'] });
}

/**
 * @param {Record<string, unknown>} partial
 */
function writeStatus(partial) {
  fs.mkdirSync(outDir, { recursive: true });
  const payload = {
    updatedAt: new Date().toISOString(),
    statusPath,
    logPath,
    withStorefront,
    ...partial,
  };
  fs.writeFileSync(statusPath, `${JSON.stringify(payload, null, 2)}\n`);
}

/**
 * @param {import('node:fs').WriteStream} log
 * @param {string} line
 */
function logLine(log, line) {
  const text = line.endsWith('\n') ? line : `${line}\n`;
  log.write(text);
  process.stdout.write(text);
}

/**
 * @param {{ id: string; args: string[] }} step
 * @param {import('node:fs').WriteStream} log
 * @returns {Promise<number>}
 */
function runStep(step, log) {
  return new Promise((resolve) => {
    logLine(log, `\n======== ${step.id} ========`);
    const child = spawn('pnpm', step.args, {
      cwd: root,
      env: process.env,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => {
      log.write(chunk);
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      log.write(chunk);
      process.stderr.write(chunk);
    });
    child.on('error', (err) => {
      logLine(log, `spawn error: ${err.message}`);
      resolve(1);
    });
    child.on('close', (code) => {
      resolve(typeof code === 'number' ? code : 1);
    });
  });
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const log = fs.createWriteStream(logPath, { flags: 'w' });
  logLine(log, `# pre-commit checklist\nstarted: ${new Date().toISOString()}`);

  /** @type {string[]} */
  const completed = [];
  const startedAt = new Date().toISOString();

  writeStatus({
    state: 'running',
    startedAt,
    completed,
    current: steps[0]?.id ?? null,
    failedStep: null,
    exitCode: null,
    ok: null,
  });

  try {
    for (const step of steps) {
      writeStatus({
        state: 'running',
        startedAt,
        completed,
        current: step.id,
        failedStep: null,
        exitCode: null,
        ok: null,
      });

      const code = await runStep(step, log);
      if (code !== 0) {
        writeStatus({
          state: 'failed',
          startedAt,
          completed,
          current: null,
          failedStep: step.id,
          exitCode: code,
          ok: false,
          finishedAt: new Date().toISOString(),
        });
        logLine(log, `\nFAIL at ${step.id} (exit ${code})\nStatus: ${statusPath}`);
        process.exitCode = code;
        return;
      }
      completed.push(step.id);
    }

    writeStatus({
      state: 'passed',
      startedAt,
      completed,
      current: null,
      failedStep: null,
      exitCode: 0,
      ok: true,
      finishedAt: new Date().toISOString(),
    });
    logLine(log, `\nPASS — all ${completed.length} steps. Status: ${statusPath}`);
  } finally {
    await new Promise((resolve) => log.end(resolve));
  }
}

main().catch((err) => {
  writeStatus({
    state: 'failed',
    startedAt: new Date().toISOString(),
    completed: [],
    current: null,
    failedStep: 'runner',
    exitCode: 1,
    ok: false,
    error: err instanceof Error ? err.message : String(err),
    finishedAt: new Date().toISOString(),
  });
  console.error(err);
  process.exit(1);
});
