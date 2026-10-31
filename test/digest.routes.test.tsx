import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const LONG_ERROR =
  'upstream 503 from fixtures host after three attempts, last body was service unavailable and the connection was closed by the peer before any header arrived';

const line = (o: Record<string, unknown>) => JSON.stringify(o);

// Written out of job order on purpose; the digest sorts by job.
const FULL_NIGHT =
  [
    line({ at: '2026-10-29T00:00:04+01:00', job: 'lane/sync', status: 'ok', owner: 'rook' }),
    line({ at: '2026-10-29T01:30:00+01:00', job: 'fixtures/refresh', status: 'retry', owner: null, error: 'upstream 503' }),
    line({ at: '2026-10-29T01:35:00+01:00', job: 'fixtures/refresh', status: 'fail', owner: null, error: LONG_ERROR }),
    line({ at: '2026-10-28T23:00:02+01:00', job: 'rig/rotate-logs', status: 'ok', owner: 'lane-07' }),
    line({ at: '2026-10-29T03:00:00+01:00', job: 'lane/sync', status: 'ok', owner: 'rook' }),
  ].join('\n') + '\n';

// Third line is cut off mid-write; its time is still readable in the raw text.
const BAD_LINE_NIGHT = [
  line({ at: '2026-10-29T05:00:00+01:00', job: 'lane/sync', status: 'ok', owner: 'rook' }),
  line({ at: '2026-10-29T05:30:00+01:00', job: 'fixtures/refresh', status: 'ok', owner: 'rook' }),
  '{"at":"2026-10-29T05:59:58+01:00","job":"lane/sy',
].join('\n');

let dir: string;
const makeApp = () =>
  createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir });

// First cell of each body row, tags stripped, in page order.
function jobsInTable(html: string): string[] {
  const jobs: string[] = [];
  for (const m of html.matchAll(/<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>/g)) {
    jobs.push((m[1] ?? '').replace(/<[^>]*>/g, '').trim());
  }
  return jobs;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(dir, '2026-10-29.jsonl'), FULL_NIGHT);
  writeFileSync(join(dir, '2026-10-30.jsonl'), '');
  writeFileSync(join(dir, '2026-10-31.jsonl'), BAD_LINE_NIGHT);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('digest page', () => {
  it('shows the lane banner and one row per job, sorted by job', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await makeApp().request('/digest/2026-10-29');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(jobsInTable(html)).toEqual(['fixtures/refresh', 'lane/sync', 'rig/rotate-logs']);
  });

  it('answers 404 when the night has no file', async () => {
    const res = await makeApp().request('/digest/2026-01-01');
    expect(res.status).toBe(404);
  });

  it('says nothing ran for an empty file', async () => {
    const res = await makeApp().request('/digest/2026-10-30');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('counts a cut-off line and shows its recovered time, without guessing the job', async () => {
    const res = await makeApp().request('/digest/2026-10-31');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('1 line could not be read');
    expect(html).toContain('line 3, cut off at 2026-10-29T05:59:58+01:00');
    expect(jobsInTable(html)).toEqual(['fixtures/refresh', 'lane/sync']);
  });

  it('renders a null owner as a dash', async () => {
    const html = await (await makeApp().request('/digest/2026-10-29')).text();
    expect(html).toContain('—');
  });

  it('keeps the offset from the log in every time', async () => {
    const html = await (await makeApp().request('/digest/2026-10-29')).text();
    expect(html).toContain('2026-10-28T23:00:02+01:00');
    expect(html).toContain('2026-10-29T03:00:00+01:00');
    expect(html).not.toMatch(/T\d\d:\d\d:\d\d(\.\d+)?Z/);
  });

  it('shows a long error in full', async () => {
    const html = await (await makeApp().request('/digest/2026-10-29')).text();
    expect(html).toContain(LONG_ERROR);
    expect(html).not.toContain('…');
    expect(html).not.toContain('...');
  });
});

describe('digest json', () => {
  type Body = {
    night: string;
    rows: { job: string; owner: string | null; lastError: string | null; firstAt: string; lastAt: string }[];
    unreadable: { line: number; at: string | null }[];
  };

  it('returns night, rows and unreadable', async () => {
    const res = await makeApp().request('/api/digest/2026-10-29');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.night).toBe('2026-10-29');
    expect(body.unreadable).toEqual([]);
    expect(body.rows.map((r) => r.job)).toEqual(['fixtures/refresh', 'lane/sync', 'rig/rotate-logs']);
    expect(body.rows[0]).toMatchObject({
      job: 'fixtures/refresh',
      owner: null,
      runs: 2,
      retries: 1,
      lastStatus: 'fail',
      lastError: LONG_ERROR,
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:35:00+01:00',
    });
  });

  it('answers 404 when the night has no file', async () => {
    const res = await makeApp().request('/api/digest/2026-01-01');
    expect(res.status).toBe(404);
  });

  it('lists the unreadable line with its recovered time', async () => {
    const res = await makeApp().request('/api/digest/2026-10-31');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.unreadable).toEqual([{ line: 3, at: '2026-10-29T05:59:58+01:00' }]);
  });

  it('lists the same jobs in the same order as the page', async () => {
    for (const night of ['2026-10-29', '2026-10-31']) {
      const app = makeApp();
      const html = await (await app.request(`/digest/${night}`)).text();
      const body = (await (await app.request(`/api/digest/${night}`)).json()) as Body;
      expect(jobsInTable(html)).toEqual(body.rows.map((r) => r.job));
    }
  });

  it('keeps a null owner as null and times with their offset', async () => {
    const body = (await (await makeApp().request('/api/digest/2026-10-29')).json()) as Body;
    expect(body.rows[0]?.owner).toBeNull();
    expect(body.rows[2]?.firstAt).toBe('2026-10-28T23:00:02+01:00');
  });
});
