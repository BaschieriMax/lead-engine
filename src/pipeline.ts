import type { SearchConfig } from './config';
import { classifyLinks } from './filters/websiteFilter';
import type { LeadSource } from './sources/LeadSource';
import { selectNewCandidates, type SeenFile } from './store/seenStore';
import type { Candidate, SourceError, SourceId } from './types';

export type RunStatus = 'ok' | 'partial' | 'failed';

/** Shape of data/candidates/latest.json, read by the morning Claude run. */
export interface CandidatesFile {
  generatedAt: string;
  runDate: string;
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
  };
  errors: SourceError[];
  candidates: Candidate[];
}

export interface PipelineResult {
  output: CandidatesFile;
  seen: SeenFile;
}

/** Run date in Italian local time, so it matches the morning report. */
export function toRunDate(now: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(now);
}

function statusOf(errorCount: number, municipalityCount: number): RunStatus {
  if (errorCount === 0) return 'ok';
  return errorCount >= municipalityCount ? 'failed' : 'partial';
}

/** Search → classify → dedupe. No file I/O, so it can be tested end to end. */
export async function runPipeline(
  config: SearchConfig,
  source: LeadSource,
  seen: SeenFile,
  now: Date,
): Promise<PipelineResult> {
  const runDate = toRunDate(now);
  const result = await source.search({
    municipalities: config.municipalities,
    categories: config.categories,
  });

  const classified: Candidate[] = result.leads.map((lead) => ({ ...lead, webStatus: classifyLinks(lead.links) }));
  const selection = selectNewCandidates(classified, seen, config.maxNewCandidatesPerRun, runDate);

  return {
    seen: selection.seen,
    output: {
      generatedAt: now.toISOString(),
      runDate,
      status: statusOf(result.errors.length, config.municipalities.length),
      source: source.id,
      attribution: source.attribution,
      stats: { fetched: result.leads.length, skipped: result.skipped, ...selection.stats },
      errors: result.errors,
      candidates: selection.newCandidates,
    },
  };
}
