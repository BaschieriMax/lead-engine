import { describe, expect, it, vi } from 'vitest';
import type { CategoryConfig, OsmConfig } from '../../config';
import { OsmSource } from './OsmSource';

const PRIMARY = 'https://primary.test/api/interpreter';
const FALLBACK = 'https://fallback.test/api/interpreter';

const config: OsmConfig = {
  endpoints: [PRIMARY, FALLBACK],
  timeoutSeconds: 60,
  delayBetweenRequestsMs: 0,
  retryPauseMs: 0,
};
const categories: CategoryConfig[] = [
  { id: 'hairdresser', label: 'Parrucchiere', osmTag: { key: 'shop', value: 'hairdresser' } },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const busy = () => new Response('busy', { status: 504, statusText: 'Gateway Timeout' });
const oneSalon = () => jsonResponse({ elements: [{ type: 'node', id: 1, tags: { shop: 'hairdresser', name: 'A' } }] });

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

    const result = await new OsmSource(config, { fetchFn }).search({ municipalities: ['Sassuolo', 'Formigine'], categories });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(result.leads.map((l) => [l.leadKey, l.municipality])).toEqual([
      ['osm:node/1', 'Sassuolo'],
      ['osm:node/3', 'Formigine'],
    ]);
    expect(result.skipped).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it('sends a form-encoded POST with a User-Agent to the first endpoint', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ elements: [] }));
    await new OsmSource(config, { fetchFn }).search({ municipalities: ['Sassuolo'], categories });

    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe(PRIMARY);
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('User-Agent')).toMatch(/^lead-engine\//);
    expect((init?.body as URLSearchParams).get('data')).toContain('"name"="Sassuolo"');
  });

  it('falls back to the next endpoint when one is busy', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(busy()).mockResolvedValueOnce(oneSalon());

    const result = await new OsmSource(config, { fetchFn }).search({ municipalities: ['Sassuolo'], categories });

    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual([PRIMARY, FALLBACK]);
    expect(result.leads).toHaveLength(1);
    expect(result.errors).toEqual([]);
  });

  it('pauses and makes a second pass when every endpoint is busy', async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(busy())
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(oneSalon());

    const result = await new OsmSource({ ...config, retryPauseMs: 30000 }, { fetchFn, sleep }).search({
      municipalities: ['Sassuolo'],
      categories,
    });

    expect(sleep).toHaveBeenCalledWith(30000);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(result.leads).toHaveLength(1);
  });

  it('gives up after two passes and reports every failure', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(busy()));

    const result = await new OsmSource(config, { fetchFn }).search({ municipalities: ['Sassuolo'], categories });

    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(result.errors[0]?.message).toMatch(/^All Overpass endpoints failed \(primary\.test: .*fallback\.test: /);
  });

  it('does not retry a non-retryable error', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('bad', { status: 400, statusText: 'Bad Request' }))
      .mockResolvedValueOnce(jsonResponse({ elements: [] }));

    const result = await new OsmSource(config, { fetchFn }).search({
      municipalities: ['Sassuolo', 'Formigine'],
      categories,
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(result.errors).toEqual([{ municipality: 'Sassuolo', message: 'Overpass responded 400 Bad Request' }]);
  });

  it('treats an HTML error page as busy', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('<html>overloaded</html>', { status: 200 }))
      .mockResolvedValueOnce(oneSalon());

    const result = await new OsmSource(config, { fetchFn }).search({ municipalities: ['Sassuolo'], categories });
    expect(result.leads).toHaveLength(1);
  });

  it('treats a server-side timeout remark as busy, not as an empty result', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ elements: [], remark: 'runtime error: Query timed out in "query" at line 3' }))
      .mockResolvedValueOnce(oneSalon());

    const result = await new OsmSource(config, { fetchFn }).search({ municipalities: ['Sassuolo'], categories });
    expect(result.leads).toHaveLength(1);
  });

  it('rejects an unexpected response shape', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ foo: 'bar' }));
    const result = await new OsmSource(config, { fetchFn }).search({ municipalities: ['Sassuolo'], categories });
    expect(result.errors[0]?.message).toBe('Unexpected Overpass response shape');
  });
});
