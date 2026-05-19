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

  it('wires onCardAction to all three StandardTaskChatRail mounts', () => {
    const taskModalPath = join(process.cwd(), 'src/components/modals/TaskModal.tsx');
    const src = readFileSync(taskModalPath, 'utf8');
    expect((src.match(/onCardAction=\{handleCardAction\}/g) || []).length).toBe(3);
    expect(src.includes('handleAiGenerateWorkout(buildWizardPayload())')).toBe(true);
    expect(src.includes('viewerWorkoutSet != null')).toBe(true);
    expect(src.includes("event: 'coach.card_action.triggered'")).toBe(true);
  });

  it('wires buildOutgoingMessageMetadata to all three rails and gates task_modal_live_state on workout types', () => {
    const taskModalPath = join(process.cwd(), 'src/components/modals/TaskModal.tsx');
    const src = readFileSync(taskModalPath, 'utf8');
    expect((src.match(/buildOutgoingMessageMetadata=/g) || []).length).toBe(3);
    expect(
      src.includes('buildOutgoingMessageMetadata={buildStandardTaskChatRailOutgoingMetadata}'),
    ).toBe(true);
    expect(
      src.includes("if (itemType !== 'workout' && itemType !== 'workout_log') return null"),
    ).toBe(true);
    expect(src.includes('task_modal_live_state:')).toBe(true);
  });
});
