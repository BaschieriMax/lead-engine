import type { SourceId, SourceResult } from '../types';
import type { CategoryConfig } from '../config';

export interface SearchRequest {
  municipalities: string[];
  categories: CategoryConfig[];
}

/**
 * A place where businesses can be discovered.
 * Every implementation returns leads in the same shape, so the rest of the
 * pipeline (filter, dedupe, profiler, report) never depends on the source.
 */
export interface LeadSource {
  readonly id: SourceId;
  /** Human-readable attribution required by the source licence. */
  readonly attribution: string;
  search(request: SearchRequest): Promise<SourceResult>;
}
