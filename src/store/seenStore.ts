import { readFile, writeFile } from 'node:fs/promises';
import type { Candidate, LeadKey, WebStatus } from '../types';

export interface SeenEntry {
  /** Run date (YYYY-MM-DD, Europe/Rome) when the lead was first recorded. */
  firstSeen: string;
  /** Classification at first sight. */
  webStatus: WebStatus;
}

export interface SeenFile {
  version: 1;
  entries: Record<LeadKey, SeenEntry>;
}

export interface SelectionStats {
  hasSite: number;
  alreadySeen: number;
  newCandidates: number;
  /** Prospects found but left for a later run because of the per-run cap. */
  deferred: number;
}

export interface Selection {
  newCandidates: Candidate[];
  seen: SeenFile;
  stats: SelectionStats;
}

/** Leads with no link at all come first: they are the strongest prospects. */
const PRIORITY: Record<WebStatus, number> = { none: 0, social_only: 1, has_site: 2 };

export function emptySeen(): SeenFile {
  return { version: 1, entries: {} };
}

export function parseSeen(raw: unknown): SeenFile {
  if (
    typeof raw === 'object' &&
    raw !== null &&
    (raw as { version?: unknown }).version === 1 &&
    typeof (raw as { entries?: unknown }).entries === 'object' &&
    (raw as { entries?: unknown }).entries !== null
  ) {
    return raw as SeenFile;
  }
  throw new Error('Invalid data/seen.json: expected { "version": 1, "entries": {} }');
}

/**
 * Picks tonight's new candidates and returns the updated seen file.
 * Pure: does not mutate the input.
 *
 * - Leads already recorded are ignored (the Lead Board tracks them from now on).
 * - New leads with their own site are recorded, so they are not re-checked every night.
 * - New prospects are sorted by priority and capped; the ones over the cap are
 *   NOT recorded, so they come back in the next run.
 */
export function selectNewCandidates(
  candidates: readonly Candidate[],
  seen: SeenFile,
  maxNew: number,
  runDate: string,
): Selection {
  const entries: Record<LeadKey, SeenEntry> = { ...seen.entries };
  const prospects: Candidate[] = [];
  let hasSite = 0;
  let alreadySeen = 0;

  for (const candidate of candidates) {
    if (entries[candidate.leadKey]) {
      alreadySeen += 1;
    } else if (candidate.webStatus === 'has_site') {
      entries[candidate.leadKey] = { firstSeen: runDate, webStatus: candidate.webStatus };
      hasSite += 1;
    } else {
      prospects.push(candidate);
    }
  }

  prospects.sort(
    (a, b) => PRIORITY[a.webStatus] - PRIORITY[b.webStatus] || a.name.localeCompare(b.name, 'it'),
  );

  const newCandidates = prospects.slice(0, maxNew);
  for (const candidate of newCandidates) {
    entries[candidate.leadKey] = { firstSeen: runDate, webStatus: candidate.webStatus };
  }

  return {
    newCandidates,
    seen: { version: 1, entries },
    stats: {
      hasSite,
      alreadySeen,
      newCandidates: newCandidates.length,
      deferred: prospects.length - newCandidates.length,
    },
  };
}

export async function readSeen(path: string): Promise<SeenFile> {
  try {
    return parseSeen(JSON.parse(await readFile(path, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptySeen();
    throw error;
  }
}

export async function writeSeen(path: string, seen: SeenFile): Promise<void> {
  // Sorted keys keep diffs small and readable in nightly commits.
  const sorted = Object.fromEntries(
    Object.entries(seen.entries).sort(([a], [b]) => a.localeCompare(b)),
  );
  await writeFile(path, `${JSON.stringify({ version: 1, entries: sorted }, null, 2)}\n`, 'utf8');
}
