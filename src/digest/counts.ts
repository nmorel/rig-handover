import type { Night, RunStatus } from './types.js';

export type NightCounts = Record<RunStatus, number> & { unreadable: number };

// DigestRow has no per-line ok/fail tally, so this counts jobs by their last status.
export function nightCounts(night: Night): NightCounts {
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0, unreadable: night.unreadable.length };
  for (const row of night.rows) counts[row.lastStatus] += 1;
  return counts;
}
