/** Shared guard so overlay pause and global block pause cannot double-fire advanceSegment. */
const syncingRef = { current: false };

export function tryBeginIntervalMechanicsAdvance(): boolean {
  if (syncingRef.current) return false;
  syncingRef.current = true;
  return true;
}

export function endIntervalMechanicsAdvance(): void {
  syncingRef.current = false;
}

export function runIntervalMechanicsAdvance<T>(fn: () => Promise<T>): Promise<T | undefined> {
  if (!tryBeginIntervalMechanicsAdvance()) return Promise.resolve(undefined);
  return fn().finally(() => {
    endIntervalMechanicsAdvance();
  });
}
