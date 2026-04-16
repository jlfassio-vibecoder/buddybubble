/** Rightmost `/` that starts a `/task` token (after start or whitespace), not slashes inside e.g. `https://`. */
export function lastTaskMentionSlashIndex(s: string): number {
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] !== '/') continue;
    if (i === 0) return 0;
    const before = s[i - 1];
    if (before === ' ' || before === '\n' || before === '\r' || before === '\t') return i;
  }
  return -1;
}
