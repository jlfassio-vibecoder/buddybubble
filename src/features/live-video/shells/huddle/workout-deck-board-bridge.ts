'use client';

import { useSyncExternalStore } from 'react';
import type { TaskRow } from '@/types/database';

type Listener = () => void;

let isSelectingFromBoard = false;
/** When selecting, Kanban dispatches here; set in `enterSelectionMode` from the active `WorkoutDeckSelectionProvider`. */
let addTaskFromBoardHandler: ((task: TaskRow) => void) | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

export function subscribeWorkoutDeckBoardSelecting(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getWorkoutDeckBoardSelectingSnapshot(): boolean {
  return isSelectingFromBoard;
}

export function setWorkoutDeckBoardSelecting(next: boolean): void {
  if (isSelectingFromBoard === next) return;
  isSelectingFromBoard = next;
  if (!next) {
    addTaskFromBoardHandler = null;
  }
  emit();
}

export function setWorkoutDeckBoardAddTaskHandler(handler: ((task: TaskRow) => void) | null): void {
  addTaskFromBoardHandler = handler;
}

/**
 * Kanban → deck: uses the handler registered by the provider that entered selection mode
 * (nested class deck vs root dock), else `fallback` (dashboard wires outer `addTaskToDeck`).
 */
export function dispatchWorkoutDeckTaskFromBoard(
  task: TaskRow,
  fallback: (t: TaskRow) => void,
): void {
  if (addTaskFromBoardHandler) {
    addTaskFromBoardHandler(task);
    return;
  }
  fallback(task);
}

/** Shared Kanban “workout selection mode” + dock layout; mirrors `enterSelectionMode` / `exitSelectionMode`. */
export function useWorkoutDeckBoardSelecting(): boolean {
  return useSyncExternalStore(
    subscribeWorkoutDeckBoardSelecting,
    getWorkoutDeckBoardSelectingSnapshot,
    getWorkoutDeckBoardSelectingSnapshot,
  );
}
