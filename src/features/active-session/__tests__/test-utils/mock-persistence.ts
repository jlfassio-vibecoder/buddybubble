import { createActor, type ActorRefFrom } from 'xstate';
import { vi } from 'vitest';
import type { PersistenceAdapter } from '../../actors/persistence.actor';
import { activeSessionMachine } from '../../machines/active-session.machine';
import type { ActiveSessionInput } from '../../machines/types';
import { createDefaultInput } from './fixtures';

export type MockPersistenceOptions = {
  insertDelayMs?: number;
  updateDelayMs?: number;
  logTaskId?: string;
  blockInsertUntilResolved?: boolean;
  failInsert?: boolean;
  failUpdate?: boolean;
};

export type MockPersistenceHandle = {
  adapter: PersistenceAdapter;
  ops: Array<'insert' | 'update'>;
  resolveInsert: () => void;
  insertPromise: Promise<{ logTaskId: string }>;
};

export function createMockPersistenceAdapter(
  options: MockPersistenceOptions = {},
): MockPersistenceHandle {
  const ops: Array<'insert' | 'update'> = [];
  const logTaskId = options.logTaskId ?? 'log-draft-001';
  let insertResolve: (value: { logTaskId: string }) => void = () => {};

  const insertPromise = new Promise<{ logTaskId: string }>((resolve) => {
    insertResolve = resolve;
  });

  const adapter: PersistenceAdapter = {
    insertDraft: async () => {
      ops.push('insert');
      if (options.failInsert) {
        throw new Error('insert_failed');
      }
      if (options.blockInsertUntilResolved) {
        return insertPromise;
      }
      if (options.insertDelayMs) {
        await new Promise((r) => setTimeout(r, options.insertDelayMs));
      }
      return { logTaskId };
    },
    updateDraft: async () => {
      ops.push('update');
      if (options.failUpdate) {
        throw new Error('update_failed');
      }
      if (options.updateDelayMs) {
        await new Promise((r) => setTimeout(r, options.updateDelayMs));
      }
    },
  };

  return {
    adapter,
    ops,
    resolveInsert: () => insertResolve({ logTaskId }),
    insertPromise,
  };
}

export type TestActor = ActorRefFrom<typeof activeSessionMachine>;

export function createTestActor(
  inputOverrides: Partial<ActiveSessionInput> = {},
  persistence?: MockPersistenceHandle,
): TestActor {
  const mock = persistence ?? createMockPersistenceAdapter();
  const input = createDefaultInput({
    ...inputOverrides,
    persistenceAdapter: mock.adapter,
  });

  return createActor(activeSessionMachine, { input });
}

export function advanceAutosave(ms = 2000): void {
  vi.advanceTimersByTime(ms);
}

export async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

export async function waitForSessionSettled(actor: TestActor): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await flushPromises();
    const state = getMachineStateValue(actor);
    if (state === 'closing' || state === 'completed' || actor.getSnapshot().status === 'done') {
      return;
    }
  }
}

export function getMachineStateValue(actor: TestActor): string {
  const snapshot = actor.getSnapshot();
  const value = snapshot.value;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'active' in value) {
    const active = (value as { active: string }).active;
    return `active.${active}`;
  }
  return JSON.stringify(value);
}
