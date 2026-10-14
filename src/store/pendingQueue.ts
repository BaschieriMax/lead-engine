import { readFile } from 'node:fs/promises';
import type { Candidate, QueuedCandidate, WebStatus } from '../types';

/** Leads with no link at all come first: they are the strongest prospects. */
const PRIORITY: Record<WebStatus, number> = { none: 0, social_only: 1, has_site: 2 };
const WEB_STATUSES = new Set<string>(Object.keys(PRIORITY));

export interface MergeResult {
  pending: QueuedCandidate[];
  /** Previously queued candidates dropped because the lead run already processed them. */
  removedProcessed: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Builds the queue for the next lead run. Pure: does not mutate its inputs.
 *
 * - Keeps every previously queued candidate the lead run has not processed yet,
 *   with its original `queuedOn` date.
 * - Adds tonight's new candidates with `queuedOn = runDate`.
 * - Drops anything whose key is in `processedKeys` (data/leads-index.json).
 * - Orders by priority, then oldest first, then name.
 */
export function mergePending(
  previous: readonly QueuedCandidate[],
  fresh: readonly Candidate[],
  processedKeys: ReadonlySet<string>,
  runDate: string,
): MergeResult {
  const byKey = new Map<string, QueuedCandidate>();
  let removedProcessed = 0;

  for (const candidate of previous) {
    if (processedKeys.has(candidate.leadKey)) {
      removedProcessed += 1;
    } else if (!byKey.has(candidate.leadKey)) {
      byKey.set(candidate.leadKey, candidate);
    }
  }

  for (const candidate of fresh) {
    if (processedKeys.has(candidate.leadKey) || byKey.has(candidate.leadKey)) continue;
    byKey.set(candidate.leadKey, { ...candidate, queuedOn: runDate });
  }

  const pending = [...byKey.values()].sort(
    (a, b) =>
      PRIORITY[a.webStatus] - PRIORITY[b.webStatus] ||
      a.queuedOn.localeCompare(b.queuedOn) ||
      a.name.localeCompare(b.name, 'it'),
  );

  return { pending, removedProcessed };
}

/**
 * Reads the queue from a previous candidates file.
 * Files written before the queue existed have no `queuedOn`: their run date is used.
 * Malformed items are skipped; a file without a `candidates` array is rejected,
 * so a bad file stops the run instead of silently emptying the queue.
 */
export function parsePendingQueue(raw: unknown): QueuedCandidate[] {
  if (!isRecord(raw) || !Array.isArray(raw.candidates)) {
    throw new Error('Invalid data/candidates/latest.json: expected a "candidates" array');
  }
  const fallbackDate = typeof raw.runDate === 'string' ? raw.runDate : '';

  return raw.candidates.flatMap((item): QueuedCandidate[] => {
    if (
      !isRecord(item) ||
      typeof item.leadKey !== 'string' ||
      typeof item.name !== 'string' ||
      typeof item.webStatus !== 'string' ||
      !WEB_STATUSES.has(item.webStatus)
    ) {
      return [];
    }
    const queuedOn = typeof item.queuedOn === 'string' ? item.queuedOn : fallbackDate;
    return [{ ...(item as unknown as Candidate), queuedOn }];
  });
}

/** Keys of every lead the lead run has already processed (profiled, has_site or duplicate). */
export function parseProcessedKeys(raw: unknown): Set<string> {
  if (!isRecord(raw) || !isRecord(raw.leads)) {
    throw new Error('Invalid data/leads-index.json: expected { "version": 1, "leads": {} }');
  }
  return new Set(Object.keys(raw.leads));
}

async function readJsonOrNull(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function readPendingQueue(path: string): Promise<QueuedCandidate[]> {
  const raw = await readJsonOrNull(path);
  return raw === null ? [] : parsePendingQueue(raw);
}

export async function readProcessedKeys(path: string): Promise<Set<string>> {
  const raw = await readJsonOrNull(path);
  return raw === null ? new Set() : parseProcessedKeys(raw);
}
