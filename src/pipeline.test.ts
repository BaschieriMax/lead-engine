import { describe, expect, it } from 'vitest';
import type { SearchConfig } from './config';
import { runPipeline, toRunDate } from './pipeline';
import type { LeadSource } from './sources/LeadSource';
import { emptySeen } from './store/seenStore';
import type { Lead, SourceResult } from './types';

const config: SearchConfig = {
  source: 'osm',
  municipalities: ['Sassuolo', 'Formigine'],
  categories: [{ id: 'hairdresser', label: 'Parrucchiere', osmTag: { key: 'shop', value: 'hairdresser' } }],
  maxNewCandidatesPerRun: 10,
  osm: { endpoint: 'https://overpass.test', timeoutSeconds: 60, delayBetweenRequestsMs: 0 },
};

function lead(id: number, links: string[]): Lead {
  return {
    leadKey: `osm:node/${id}`,
    source: 'osm',
    name: `Salone ${id}`,
    categoryId: 'hairdresser',
    categoryLabel: 'Parrucchiere',
    municipality: 'Sassuolo',
    address: {},
    location: null,
    contacts: {},
    links,
    sourceUrl: `https://www.openstreetmap.org/node/${id}`,
  };
}

function fakeSource(result: SourceResult): LeadSource {
  return { id: 'osm', attribution: 'test attribution', search: () => Promise.resolve(result) };
}

describe('runPipeline', () => {
  it('classifies, filters and reports stats', async () => {
    const source = fakeSource({
      leads: [lead(1, []), lead(2, ['https://www.instagram.com/s2']), lead(3, ['https://salone3.it'])],
      errors: [],
      skipped: 4,
    });

    const { output, seen } = await runPipeline(config, source, emptySeen(), new Date('2026-10-14T01:00:00Z'));

    expect(output.status).toBe('ok');
    expect(output.runDate).toBe('2026-10-14');
    expect(output.attribution).toBe('test attribution');
    expect(output.candidates.map((c) => [c.leadKey, c.webStatus])).toEqual([
      ['osm:node/1', 'none'],
      ['osm:node/2', 'social_only'],
    ]);
    expect(output.stats).toEqual({ fetched: 3, skipped: 4, hasSite: 1, alreadySeen: 0, newCandidates: 2, deferred: 0 });
    expect(Object.keys(seen.entries)).toHaveLength(3);
  });

  it('marks the run as partial or failed from source errors', async () => {
    const partial = await runPipeline(
      config,
      fakeSource({ leads: [], errors: [{ municipality: 'Sassuolo', message: 'x' }], skipped: 0 }),
      emptySeen(),
      new Date(),
    );
    expect(partial.output.status).toBe('partial');

    const failed = await runPipeline(
      config,
      fakeSource({
        leads: [],
        errors: [
          { municipality: 'Sassuolo', message: 'x' },
          { municipality: 'Formigine', message: 'y' },
        ],
        skipped: 0,
      }),
      emptySeen(),
      new Date(),
    );
    expect(failed.output.status).toBe('failed');
  });
});

describe('toRunDate', () => {
  it('uses the Italian calendar day', () => {
    // 23:30 UTC on 13 October is already 14 October in Italy (UTC+2).
    expect(toRunDate(new Date('2026-10-13T23:30:00Z'))).toBe('2026-10-14');
  });
});
