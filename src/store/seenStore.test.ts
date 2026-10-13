import { describe, expect, it } from 'vitest';
import type { Candidate, WebStatus } from '../types';
import { emptySeen, parseSeen, selectNewCandidates, type SeenFile } from './seenStore';

function candidate(id: number, name: string, webStatus: WebStatus): Candidate {
  return {
    leadKey: `osm:node/${id}`,
    source: 'osm',
    name,
    categoryId: 'hairdresser',
    categoryLabel: 'Parrucchiere',
    municipality: 'Sassuolo',
    address: {},
    location: null,
    contacts: {},
    links: [],
    sourceUrl: `https://www.openstreetmap.org/node/${id}`,
    webStatus,
  };
}

describe('selectNewCandidates', () => {
  it('skips leads already seen and records sites without proposing them', () => {
    const seen: SeenFile = { version: 1, entries: { 'osm:node/1': { firstSeen: '2026-10-01', webStatus: 'none' } } };
    const result = selectNewCandidates(
      [candidate(1, 'Vecchio', 'none'), candidate(2, 'Con sito', 'has_site'), candidate(3, 'Nuovo', 'none')],
      seen,
      10,
      '2026-10-14',
    );

    expect(result.newCandidates.map((c) => c.leadKey)).toEqual(['osm:node/3']);
    expect(result.stats).toEqual({ hasSite: 1, alreadySeen: 1, newCandidates: 1, deferred: 0 });
    expect(result.seen.entries['osm:node/2']).toEqual({ firstSeen: '2026-10-14', webStatus: 'has_site' });
    expect(result.seen.entries['osm:node/3']).toEqual({ firstSeen: '2026-10-14', webStatus: 'none' });
  });

  it('puts leads with no link before social-only ones, then sorts by name', () => {
    const result = selectNewCandidates(
      [candidate(1, 'Zeta', 'social_only'), candidate(2, 'Beta', 'none'), candidate(3, 'Alfa', 'none')],
      emptySeen(),
      10,
      '2026-10-14',
    );
    expect(result.newCandidates.map((c) => c.name)).toEqual(['Alfa', 'Beta', 'Zeta']);
  });

  it('caps new candidates and leaves the rest unrecorded for the next run', () => {
    const result = selectNewCandidates(
      [candidate(1, 'A', 'none'), candidate(2, 'B', 'none'), candidate(3, 'C', 'social_only')],
      emptySeen(),
      2,
      '2026-10-14',
    );
    expect(result.newCandidates).toHaveLength(2);
    expect(result.stats.deferred).toBe(1);
    expect(result.seen.entries['osm:node/3']).toBeUndefined();
  });

  it('does not mutate the input seen file', () => {
    const seen = emptySeen();
    selectNewCandidates([candidate(1, 'A', 'none')], seen, 10, '2026-10-14');
    expect(seen.entries).toEqual({});
  });
});

describe('parseSeen', () => {
  it('accepts a valid file', () => {
    expect(parseSeen({ version: 1, entries: {} })).toEqual(emptySeen());
  });

  it('rejects an unknown shape', () => {
    expect(() => parseSeen({ entries: [] })).toThrow(/seen\.json/);
  });
});
