import type { SearchConfig } from './config';
import { classifyLinks } from './filters/websiteFilter';
import type { LeadSource } from './sources/LeadSource';
import { mergePending } from './store/pendingQueue';
import { selectNewCandidates, type SeenFile } from './store/seenStore';
import type { Candidate, QueuedCandidate, SourceError, SourceId } from './types';

export type RunStatus = 'ok' | 'partial' | 'failed';

/** Shape of data/candidates/latest.json, read by the lead run. */
export interface CandidatesFile {
  generatedAt: string;
  runDate: string;
  /** Outcome of tonight's search only: the queue is kept even when it fails. */
  status: RunStatus;
  source: SourceId;
  attribution: string;
  stats: {
    fetched: number;
    skipped: number;
    hasSite: number;
    alreadySeen: number;
    newCandidates: number;
    deferred: number;
    /** Queued candidates dropped because the lead run already processed them. */
    removedProcessed: number;
    /** Candidates waiting in the queue after this run. */
    pending: number;
  };
  errors: SourceError[];
  /** Queue of candidates not yet processed by the lead run. */
  candidates: QueuedCandidate[];
}

export interface QueueState {
  /** Queue read from the previous candidates file. */
  previous: readonly QueuedCandidate[];
  /** Keys already in data/leads-index.json. */
  processedKeys: ReadonlySet<string>;
}

export interface PipelineResult {
  output: CandidatesFile;
  seen: SeenFile;
}

/** Run date in Italian local time, so it matches the lead report. */
export function toRunDate(now: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(now);
}

function statusOf(errorCount: number, municipalityCount: number): RunStatus {
  if (errorCount === 0) return 'ok';
  return errorCount >= municipalityCount ? 'failed' : 'partial';
}

/** Search → classify → dedupe → merge into the queue. No file I/O, so it can be tested end to end. */
export async function runPipeline(
  config: SearchConfig,
  source: LeadSource,
  seen: SeenFile,
  queue: QueueState,
  now: Date,
): Promise<PipelineResult> {
  const runDate = toRunDate(now);
  const result = await source.search({
    municipalities: config.municipalities,
    categories: config.categories,
  });

  const classified: Candidate[] = result.leads.map((lead) => ({ ...lead, webStatus: classifyLinks(lead.links) }));
  const selection = selectNewCandidates(classified, seen, config.maxNewCandidatesPerRun, runDate);
  const { pending, removedProcessed } = mergePending(
    queue.previous,
    selection.newCandidates,
    queue.processedKeys,
    runDate,
  );

  return {
    seen: selection.seen,
    output: {
      generatedAt: now.toISOString(),
      runDate,
      status: statusOf(result.errors.length, config.municipalities.length),
      source: source.id,
      attribution: source.attribution,
      stats: {
        fetched: result.leads.length,
        skipped: result.skipped,
        ...selection.stats,
        removedProcessed,
        pending: pending.length,
      },
      errors: result.errors,
      candidates: pending,
    },
  };
}
