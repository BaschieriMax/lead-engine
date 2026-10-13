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

  /**
   * Tries every endpoint in order; a busy or unreachable instance hands over to
   * the next one. If all are busy, waits `retryPauseMs` and makes one more pass.
   * A non-retryable error (e.g. a malformed query) stops immediately.
   */
  private async fetchWithRetry(query: string): Promise<OverpassElement[]> {
    const failures: string[] = [];

    for (let pass = 0; pass < 2; pass += 1) {
      if (pass > 0) await this.sleep(this.config.retryPauseMs);

      for (const endpoint of this.config.endpoints) {
        try {
          return await this.fetchOnce(endpoint, query);
        } catch (error) {
          if (!(error instanceof RetryableError)) throw error;
          failures.push(`${new URL(endpoint).hostname}: ${error.message}`);
        }
      }
    }

    throw new Error(`All Overpass endpoints failed (${failures.join('; ')})`);
  }

  private async fetchOnce(endpoint: string, query: string): Promise<OverpassElement[]> {
    let response: Response;
    try {
      response = await this.fetchFn(endpoint, {
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
      throw new RetryableError(`request failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!response.ok) {
      const message = `Overpass responded ${response.status} ${response.statusText}`.trim();
      if (RETRYABLE_STATUS.has(response.status)) throw new RetryableError(message);
      throw new Error(message);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      // Overloaded instances sometimes answer 200 with an HTML error page.
      throw new RetryableError('response is not JSON');
    }
    if (!isOverpassResponse(body)) throw new Error('Unexpected Overpass response shape');
    // Overpass reports server-side timeouts in `remark` with a partial element list.
    const remark = (body as { remark?: unknown }).remark;
    if (typeof remark === 'string' && /runtime error|timed out|out of memory/i.test(remark)) {
      throw new RetryableError(`server error: ${remark.slice(0, 120)}`);
    }
    return body.elements;
  }
}
