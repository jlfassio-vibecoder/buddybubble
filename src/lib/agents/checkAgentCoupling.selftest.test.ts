import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { runCheck } from '../../../scripts/check-agent-coupling';

describe('check-agent-coupling self-test (guardrail for the guardrail)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-coupling-selftest-'));
    await fs.mkdir(path.join(tmpDir, 'src', 'components', 'chat'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('detects a legacy single-agent identifier and fails non-zero', async () => {
    const offendingPath = path.join(tmpDir, 'src', 'components', 'chat', 'BadComponent.tsx');
    await fs.writeFile(
      offendingPath,
      `export function BadComponent() {\n  const isBuddyTyping = true;\n  return isBuddyTyping;\n}\n`,
      'utf8',
    );

    const violations = await runCheck({ cwd: tmpDir, roots: ['src'] });
    expect(violations.length).toBeGreaterThan(0);
    const hit = violations.find((v) => v.ruleId === 'legacy-single-agent-identifier');
    expect(hit).toBeDefined();
    expect(hit?.snippet).toMatch(/isBuddyTyping/);
    expect(hit?.file).toMatch(/BadComponent\.tsx$/);
  });

  it('detects hardcoded /brand/BuddyBubble-mark.svg outside the allowlist', async () => {
    const offendingPath = path.join(tmpDir, 'src', 'components', 'chat', 'BrandLeak.tsx');
    await fs.writeFile(
      offendingPath,
      `export const AVATAR = '/brand/BuddyBubble-mark.svg';\n`,
      'utf8',
    );

    const violations = await runCheck({ cwd: tmpDir, roots: ['src'] });
    const hit = violations.find((v) => v.ruleId === 'hardcoded-buddy-mark');
    expect(hit).toBeDefined();
  });

  it('detects indexed access on agentAuthUserIds', async () => {
    const offendingPath = path.join(tmpDir, 'src', 'components', 'chat', 'IndexLeak.tsx');
    await fs.writeFile(
      offendingPath,
      `export const pick = (agentAuthUserIds: string[]) => agentAuthUserIds[0];\n`,
      'utf8',
    );

    const violations = await runCheck({ cwd: tmpDir, roots: ['src'] });
    const hit = violations.find((v) => v.ruleId === 'indexed-agent-auth-user-ids');
    expect(hit).toBeDefined();
    expect(hit?.snippet).toMatch(/agentAuthUserIds\[0\]/);
  });

  it('detects hardcoded slug literal outside the allowlist', async () => {
    const offendingPath = path.join(tmpDir, 'src', 'components', 'chat', 'SlugLeak.tsx');
    await fs.writeFile(
      offendingPath,
      `export const DEFAULT = 'organizer';\n`,
      'utf8',
    );

    const violations = await runCheck({ cwd: tmpDir, roots: ['src'] });
    const hit = violations.find((v) => v.ruleId === 'hardcoded-agent-slug-literal');
    expect(hit).toBeDefined();
  });

  it('allowlisted files do not trigger slug-literal violations', async () => {
    // ChatArea.tsx is on the allowlist — hardcoding 'coach' here is legal.
    const allowed = path.join(tmpDir, 'src', 'components', 'chat', 'ChatArea.tsx');
    await fs.writeFile(allowed, `const DEFAULT_SLUG = 'coach';\n`, 'utf8');

    const violations = await runCheck({ cwd: tmpDir, roots: ['src'] });
    const hit = violations.find((v) => v.ruleId === 'hardcoded-agent-slug-literal');
    expect(hit).toBeUndefined();
  });

  it('returns empty list when there are no violations', async () => {
    const clean = path.join(tmpDir, 'src', 'components', 'chat', 'Clean.tsx');
    await fs.writeFile(clean, `export const VALUE = 42;\n`, 'utf8');
    const violations = await runCheck({ cwd: tmpDir, roots: ['src'] });
    expect(violations).toEqual([]);
  });
});
