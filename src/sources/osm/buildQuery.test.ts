import { describe, expect, it } from 'vitest';
import type { CategoryConfig } from '../../config';
import { buildQuery } from './buildQuery';

const categories: CategoryConfig[] = [
  { id: 'hairdresser', label: 'Parrucchiere', osmTag: { key: 'shop', value: 'hairdresser' } },
  { id: 'beauty', label: 'Estetista', osmTag: { key: 'shop', value: 'beauty' } },
];

describe('buildQuery', () => {
  const query = buildQuery('Fiorano Modenese', categories, 60);

  it('requests JSON with the given server timeout', () => {
    expect(query.startsWith('[out:json][timeout:60];')).toBe(true);
  });

  it('scopes the search to the municipality boundary', () => {
    expect(query).toContain(
      'area["boundary"="administrative"]["admin_level"="8"]["name"="Fiorano Modenese"]->.searchArea;',
    );
  });

  it('includes one filter per category on nodes, ways and relations', () => {
    expect(query).toContain('nwr["shop"="hairdresser"](area.searchArea);');
    expect(query).toContain('nwr["shop"="beauty"](area.searchArea);');
  });

  it('asks for tags and a center point only', () => {
    expect(query.trimEnd().endsWith('out tags center;')).toBe(true);
  });
});
