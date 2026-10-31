// Types for the night's digest. The reader lives in src/digest/reader.ts (issue #2)
// and exports `readNight: ReadNight`.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One row per job, folded from the night's lines.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  // Latest error on any line of the night, even if the job recovered; null if none.
  lastError: string | null;
  // Times as written in the log, offset kept.
  firstAt: string;
  lastAt: string;
};

// A line that did not parse; `at` is recovered from the raw text when present.
export type UnreadableLine = {
  line: number; // 1-based
  at: string | null;
};

export type Night = {
  rows: DigestRow[];
  unreadable: UnreadableLine[];
};

// `null` when runs/<night>.jsonl does not exist; an empty file is a night with no rows.
export type ReadNight = (runsDir: string, night: string) => Night | null;
