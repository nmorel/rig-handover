import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunStatus, UnreadableLine } from './types.js';

type Line = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

const STATUSES: readonly string[] = ['ok', 'retry', 'fail'];

function isStatus(v: unknown): v is RunStatus {
  return typeof v === 'string' && STATUSES.includes(v);
}

// Parse one raw line at the edge; null when it is not a valid run line.
export function parseLine(raw: string): Line | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  const { at, job, status, owner, error } = o;
  if (typeof at !== 'string' || at === '') return null;
  if (typeof job !== 'string' || job === '') return null;
  if (!isStatus(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && error !== null && typeof error !== 'string') return null;
  return { at, job, status, owner, error: error ?? null };
}

// The `at` of a line that did not parse, read from the raw text.
export function recoverAt(raw: string): string | null {
  const m = /"at"\s*:\s*"([^"]+)"/.exec(raw);
  return m ? m[1] : null;
}

// Fold lines into one row per job, sorted by job. lastError is the latest error on any line.
export function fold(lines: Line[]): DigestRow[] {
  const byJob = new Map<string, DigestRow>();
  for (const l of lines) {
    const row = byJob.get(l.job);
    if (!row) {
      byJob.set(l.job, {
        job: l.job,
        owner: l.owner,
        runs: 1,
        retries: l.status === 'retry' ? 1 : 0,
        lastStatus: l.status,
        lastError: l.error,
        firstAt: l.at,
        lastAt: l.at,
      });
      continue;
    }
    row.owner = l.owner ?? row.owner;
    row.runs += 1;
    if (l.status === 'retry') row.retries += 1;
    row.lastStatus = l.status;
    row.lastError = l.error ?? row.lastError;
    row.lastAt = l.at;
  }
  return [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
}

export const readNight: ReadNight = (runsDir, night) => {
  // Only a date names a night; anything else is not a file we serve.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  const raws = text.split('\n');
  if (raws[raws.length - 1] === '') raws.pop();
  const lines: Line[] = [];
  const unreadable: UnreadableLine[] = [];
  raws.forEach((raw, i) => {
    const parsed = parseLine(raw.replace(/\r$/, ''));
    if (parsed) lines.push(parsed);
    else unreadable.push({ line: i + 1, at: recoverAt(raw) });
  });
  const result: Night = { rows: fold(lines), unreadable };
  return result;
};
