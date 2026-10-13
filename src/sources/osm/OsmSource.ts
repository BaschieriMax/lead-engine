import type { OsmConfig } from '../../config';
import type { Lead, SourceError, SourceResult } from '../../types';
import type { LeadSource, SearchRequest } from '../LeadSource';
import { buildQuery } from './buildQuery';
import { mapElement, type OverpassElement } from './mapElement';

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors, ODbL (https://www.openstreetmap.org/copyright)';

const USER_AGENT = 'lead-engine/0.1 (+https://github.com/BaschieriMax/lead-engine)';

/** Status codes worth one retry: Overpass is busy or timed out. */
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

export interface OsmSourceDeps {
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

class RetryableError extends Error {}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isOverpassResponse(value: unknown): value is { elements: OverpassElement[] } {
  return typeof value === 'object' && value !== null && Array.isArray((value as { elements?: unknown }).elements);
}

/** Discovers businesses on OpenStreetMap through the public Overpass API. */
export class OsmSource implements LeadSource {
  readonly id = 'osm' as const;
  readonly attribution = OSM_ATTRIBUTION;

  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly config: OsmConfig,
    deps: OsmSourceDeps = {},
  ) {
    this.fetchFn = deps.fetchFn ?? fetch;
    this.sleep = deps.sleep ?? defaultSleep;
  }

  async search({ municipalities, categories }: SearchRequest): Promise<SourceResult> {
    const leads = new Map<string, Lead>();
    const errors: SourceError[] = [];
    let skipped = 0;

    for (const [index, municipality] of municipalities.entries()) {
      // One query at a time, with a pause: the public instance is shared.
      if (index > 0) await this.sleep(this.config.delayBetweenRequestsMs);

      try {
        const query = buildQuery(municipality, categories, this.config.timeoutSeconds);
        const elements = await this.fetchWithRetry(query);
        for (const element of elements) {
          const lead = mapElement(element, municipality, categories);
          if (lead) leads.set(lead.leadKey, lead);
          else skipped += 1;
        }
      } catch (error) {
        errors.push({ municipality, message: error instanceof Error ? error.message : String(error) });
      }
    }

    return { leads: [...leads.values()], errors, skipped };
  }

  private async fetchWithRetry(query: string): Promise<OverpassElement[]> {
    try {
      return await this.fetchOnce(query);
    } catch (error) {
      if (!(error instanceof RetryableError)) throw error;
      await this.sleep(this.config.delayBetweenRequestsMs * 2);
      return this.fetchOnce(query);
    }
  }

  private async fetchOnce(query: string): Promise<OverpassElement[]> {
    let response: Response;
    try {
      response = await this.fetchFn(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: new URLSearchParams({ data: query }),
        // Client-side limit slightly above the server-side Overpass timeout.
        signal: AbortSignal.timeout((this.config.timeoutSeconds + 15) * 1000),
      });
    } catch (error) {
      // Network failures and aborts are transient: retry once.
      throw new RetryableError(`Overpass request failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!response.ok) {
      const message = `Overpass responded ${response.status} ${response.statusText}`.trim();
      if (RETRYABLE_STATUS.has(response.status)) throw new RetryableError(message);
      throw new Error(message);
    }

    const body: unknown = await response.json();
    if (!isOverpassResponse(body)) throw new Error('Unexpected Overpass response shape');
    return body.elements;
  }
}
