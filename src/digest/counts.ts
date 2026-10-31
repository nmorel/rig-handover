import type { Night, RunStatus } from './types.js';

export type NightCounts = Record<RunStatus, number> & { jobs: number; retries: number; unreadable: number };

// Jobs counted by their last status; `retries` is the sum of DigestRow.retries across jobs.
export function nightCounts(night: Night): NightCounts {
  const counts: NightCounts = {
    jobs: night.rows.length,
    ok: 0,
    retry: 0,
    fail: 0,
    retries: 0,
    unreadable: night.unreadable.length,
  };
  for (const row of night.rows) {
    counts[row.lastStatus] += 1;
    counts.retries += row.retries;
  }
  return counts;
}

// Always jobs and ok; the rest only when > 0.
export function countsLine(c: NightCounts): string {
  const parts = [`${c.jobs} jobs`, `${c.ok} ok`];
  if (c.fail > 0) parts.push(`${c.fail} fail`);
  if (c.retry > 0) parts.push(`${c.retry} retry`);
  if (c.retries > 0) parts.push(`${c.retries} retries`);
  if (c.unreadable > 0) parts.push(`${c.unreadable} unreadable`);
  return parts.join(' · ');
}
