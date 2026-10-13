import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseConfig } from './config';

const valid = {
  source: 'osm',
  municipalities: ['Sassuolo'],
  categories: [{ id: 'hairdresser', label: 'Parrucchiere', osmTag: { key: 'shop', value: 'hairdresser' } }],
  maxNewCandidatesPerRun: 30,
  osm: {
    endpoints: ['https://overpass.private.coffee/api/interpreter'],
    timeoutSeconds: 60,
    delayBetweenRequestsMs: 5000,
    retryPauseMs: 30000,
  },
};

describe('parseConfig', () => {
  it('accepts the committed config file', () => {
    const raw: unknown = JSON.parse(readFileSync(new URL('../config/search.json', import.meta.url), 'utf8'));
    expect(() => parseConfig(raw)).not.toThrow();
  });

  it('accepts a valid config', () => {
    expect(parseConfig(valid).municipalities).toEqual(['Sassuolo']);
  });

  it('rejects an unsupported source', () => {
    expect(() => parseConfig({ ...valid, source: 'places' })).toThrow(/source must be one of: osm/);
  });

  it('rejects quotes that would break the Overpass query', () => {
    expect(() => parseConfig({ ...valid, municipalities: ['Sassuolo"]'] })).toThrow(/not allowed/);
  });

  it('rejects a non-https endpoint', () => {
    expect(() => parseConfig({ ...valid, osm: { ...valid.osm, endpoints: ['http://overpass.test'] } })).toThrow(/https/);
  });

  it('rejects an empty endpoint list', () => {
    expect(() => parseConfig({ ...valid, osm: { ...valid.osm, endpoints: [] } })).toThrow(/non-empty array/);
  });

  it('rejects a non-positive cap', () => {
    expect(() => parseConfig({ ...valid, maxNewCandidatesPerRun: 0 })).toThrow(/positive integer/);
  });
});
