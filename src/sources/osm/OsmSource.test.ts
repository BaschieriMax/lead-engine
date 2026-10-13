import { describe, expect, it, vi } from 'vitest';
import type { CategoryConfig, OsmConfig } from '../../config';
import { OsmSource } from './OsmSource';

const config: OsmConfig = { endpoint: 'https://overpass.test/api/interpreter', timeoutSeconds: 60, delayBetweenRequestsMs: 0 };
const categories: CategoryConfig[] = [
  { id: 'hairdresser', label: 'Parrucchiere', osmTag: { key: 'shop', value: 'hairdresser' } },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const noSleep = () => Promise.resolve();

describe('OsmSource', () => {
  it('queries each municipality and maps named elements', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          elements: [
            { type: 'node', id: 1, lat: 1, lon: 1, tags: { shop: 'hairdresser', name: 'A' } },
            { type: 'node', id: 2, lat: 1, lon: 1, tags: { shop: 'hairdresser' } },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ elements: [{ type: 'node', id: 3, tags: { shop: 'hairdresser', name: 'B' } }] }));

    const source = new OsmSource(config, { fetchFn, sleep: noSleep });
    const result = await source.search({ municipalities: ['Sassuolo', 'Formigine'], categories });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(result.leads.map((l) => [l.leadKey, l.municipality])).toEqual([
      ['osm:node/1', 'Sassuolo'],
      ['osm:node/3', 'Formigine'],
    ]);
    expect(result.skipped).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it('sends a form-encoded POST with a User-Agent', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ elements: [] }));
    await new OsmSource(config, { fetchFn, sleep: noSleep }).search({ municipalities: ['Sassuolo'], categories });

    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe(config.endpoint);
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('User-Agent')).toMatch(/^lead-engine\//);
    expect((init?.body as URLSearchParams).get('data')).toContain('"name"="Sassuolo"');
  });

  it('retries once when Overpass is busy', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('busy', { status: 429, statusText: 'Too Many Requests' }))
      .mockResolvedValueOnce(jsonResponse({ elements: [{ type: 'node', id: 1, tags: { shop: 'hairdresser', name: 'A' } }] }));

    const result = await new OsmSource(config, { fetchFn, sleep: noSleep }).search({ municipalities: ['Sassuolo'], categories });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(result.leads).toHaveLength(1);
    expect(result.errors).toEqual([]);
  });

  it('records an error per municipality and keeps going', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('bad', { status: 400, statusText: 'Bad Request' }))
      .mockResolvedValueOnce(jsonResponse({ elements: [] }));

    const result = await new OsmSource(config, { fetchFn, sleep: noSleep }).search({
      municipalities: ['Sassuolo', 'Formigine'],
      categories,
    });

    expect(result.errors).toEqual([{ municipality: 'Sassuolo', message: 'Overpass responded 400 Bad Request' }]);
  });

  it('rejects an unexpected response shape', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ remark: 'runtime error' }));
    const result = await new OsmSource(config, { fetchFn, sleep: noSleep }).search({ municipalities: ['Sassuolo'], categories });
    expect(result.errors[0]?.message).toBe('Unexpected Overpass response shape');
  });
});
