import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('folds the night into 5 jobs sorted by job', () => {
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('records the cut-off line without guessing its job', () => {
    expect(night?.unreadable).toEqual([{ line: 16, at: '2026-10-29T05:59:58+01:00' }]);
  });

  it('counts retries and takes the last status', () => {
    const row = night?.rows.find((r) => r.job === 'fixtures/refresh');
    expect(row).toMatchObject({
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('keeps the last error of a failed job', () => {
    const row = night?.rows.find((r) => r.job === 'notes/backup');
    expect(row).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('keeps a row whose owner is null, and lines past midnight', () => {
    expect(night?.rows.find((r) => r.job === 'digest/render')?.owner).toBeNull();
    const sync = night?.rows.find((r) => r.job === 'lane/sync');
    expect(sync?.firstAt).toBe('2026-10-28T23:00:06+01:00');
    expect(sync?.lastAt).toBe('2026-10-29T05:00:04+01:00');
  });
});

describe('readNight edges', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-reader-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('returns null for a night with no file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns no rows for an empty file', () => {
    writeFileSync(join(dir, '2026-01-02.jsonl'), '');
    expect(readNight(dir, '2026-01-02')).toEqual({ rows: [], unreadable: [] });
  });

  it('puts lines that parse but do not validate in unreadable', () => {
    const good = '{"at":"2026-01-03T01:00:00+01:00","job":"a","status":"ok","owner":null}';
    const badStatus = '{"at":"2026-01-03T02:00:00+01:00","job":"b","status":"weird","owner":"x"}';
    const noJob = '{"at":"2026-01-03T03:00:00+01:00","status":"ok","owner":"x"}';
    writeFileSync(join(dir, '2026-01-03.jsonl'), [good, badStatus, noJob, 'nope', good].join('\n') + '\n');
    const night = readNight(dir, '2026-01-03');
    expect(night?.rows).toHaveLength(1);
    expect(night?.rows[0]).toMatchObject({ job: 'a', runs: 2 });
    expect(night?.unreadable).toEqual([
      { line: 2, at: '2026-01-03T02:00:00+01:00' },
      { line: 3, at: '2026-01-03T03:00:00+01:00' },
      { line: 4, at: null },
    ]);
  });

  it('refuses a night that is not a date', () => {
    expect(readNight(dir, '../etc/passwd')).toBeNull();
  });
});
