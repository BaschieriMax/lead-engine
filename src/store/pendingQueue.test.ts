import { describe, expect, it } from 'vitest';
import type { Candidate, QueuedCandidate, WebStatus } from '../types';
import { mergePending, parsePendingQueue, parseProcessedKeys } from './pendingQueue';

function candidate(id: number, name: string, webStatus: WebStatus = 'none'): Candidate {
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

function queued(id: number, name: string, queuedOn: string, webStatus: WebStatus = 'none'): QueuedCandidate {
  return { ...candidate(id, name, webStatus), queuedOn };
}

describe('mergePending', () => {
  it('keeps unprocessed candidates with their original date and adds new ones', () => {
    const { pending } = mergePending([queued(1, 'Vecchio', '2026-10-13')], [candidate(2, 'Nuovo')], new Set(), '2026-10-14');

    expect(pending.map((c) => [c.leadKey, c.queuedOn])).toEqual([
      ['osm:node/1', '2026-10-13'],
      ['osm:node/2', '2026-10-14'],
    ]);
  });

  it('drops candidates already processed by the lead run', () => {
    const { pending, removedProcessed } = mergePending(
      [queued(1, 'Fatto', '2026-10-13'), queued(2, 'Da fare', '2026-10-13')],
      [candidate(3, 'Scartato oggi')],
      new Set(['osm:node/1', 'osm:node/3']),
      '2026-10-14',
    );

    expect(pending.map((c) => c.leadKey)).toEqual(['osm:node/2']);
    expect(removedProcessed).toBe(1);
  });

  it('never duplicates a key and keeps the older entry', () => {
    const { pending } = mergePending([queued(1, 'A', '2026-10-13')], [candidate(1, 'A')], new Set(), '2026-10-14');
    expect(pending).toHaveLength(1);
    expect(pending[0]?.queuedOn).toBe('2026-10-13');
  });

  it('orders by priority, then oldest first, then name', () => {
    const { pending } = mergePending(
      [queued(1, 'Zeta', '2026-10-14'), queued(2, 'Social', '2026-10-12', 'social_only'), queued(3, 'Alfa', '2026-10-14')],
      [],
      new Set(),
      '2026-10-15',
    );
    // A new lead with no link at all beats an older social-only one.
    const merged = mergePending(pending, [candidate(4, 'Beta')], new Set(), '2026-10-15').pending;

    expect(merged.map((c) => c.name)).toEqual(['Alfa', 'Zeta', 'Beta', 'Social']);
  });

  it('does not mutate its inputs', () => {
    const previous = [queued(1, 'A', '2026-10-13')];
    mergePending(previous, [candidate(2, 'B')], new Set(['osm:node/1']), '2026-10-14');
    expect(previous).toHaveLength(1);
  });
});

describe('parsePendingQueue', () => {
  it('uses the file run date for candidates written before the queue existed', () => {
    const legacy = { runDate: '2026-10-14', candidates: [candidate(1, 'A')] };
    expect(parsePendingQueue(legacy)[0]?.queuedOn).toBe('2026-10-14');
  });

  it('keeps an existing queuedOn', () => {
    const file = { runDate: '2026-10-15', candidates: [queued(1, 'A', '2026-10-13')] };
    expect(parsePendingQueue(file)[0]?.queuedOn).toBe('2026-10-13');
  });

  it('skips malformed items', () => {
    const file = { runDate: '2026-10-14', candidates: [candidate(1, 'A'), { leadKey: 'x' }, { ...candidate(2, 'B'), webStatus: 'maybe' }] };
    expect(parsePendingQueue(file).map((c) => c.leadKey)).toEqual(['osm:node/1']);
  });

  it('rejects a file without a candidates array', () => {
    expect(() => parsePendingQueue({ runDate: '2026-10-14' })).toThrow(/candidates/);
  });
});

describe('parseProcessedKeys', () => {
  it('returns the keys of the leads index', () => {
    const keys = parseProcessedKeys({ version: 1, leads: { 'osm:node/1': {}, 'web:salone-sassuolo': {} } });
    expect([...keys]).toEqual(['osm:node/1', 'web:salone-sassuolo']);
  });

  it('rejects an unknown shape', () => {
    expect(() => parseProcessedKeys({ leads: [] })).toThrow(/leads-index\.json/);
  });
});
