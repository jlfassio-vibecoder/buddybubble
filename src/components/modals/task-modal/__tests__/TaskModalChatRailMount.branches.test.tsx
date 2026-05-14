import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('TaskModal standard rail (Phase 3.7 / 3.8)', () => {
  it('TaskModal.tsx mounts StandardTaskChatRail in three branches and wires optimistic draft props', () => {
    const taskModalPath = join(process.cwd(), 'src/components/modals/TaskModal.tsx');
    const src = readFileSync(taskModalPath, 'utf8');
    const mountOpens = src.match(/<StandardTaskChatRail[\s\n>]/g);
    expect(mountOpens?.length).toBe(3);
    expect(src.includes('isOptimisticDraft')).toBe(true);
    expect(src.includes('draftBaseline')).toBe(true);
  });
});
