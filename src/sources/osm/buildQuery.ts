import type { CategoryConfig } from '../../config';

/**
 * Builds an Overpass QL query that returns every business of the given
 * categories inside one municipality (administrative boundary, admin_level 8).
 * Ways and relations are returned with their center point.
 */
export function buildQuery(municipality: string, categories: CategoryConfig[], timeoutSeconds: number): string {
  const filters = categories
    .map(({ osmTag }) => `  nwr["${osmTag.key}"="${osmTag.value}"](area.searchArea);`)
    .join('\n');

  return [
    `[out:json][timeout:${timeoutSeconds}];`,
    `area["boundary"="administrative"]["admin_level"="8"]["name"="${municipality}"]->.searchArea;`,
    '(',
    filters,
    ');',
    'out tags center;',
  ].join('\n');
}
