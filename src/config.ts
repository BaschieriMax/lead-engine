import { readFile } from 'node:fs/promises';
import type { SourceId } from './types';

export interface OsmTag {
  key: string;
  value: string;
}

export interface CategoryConfig {
  id: string;
  label: string;
  osmTag: OsmTag;
}

export interface OsmConfig {
  endpoint: string;
  timeoutSeconds: number;
  delayBetweenRequestsMs: number;
}

export interface SearchConfig {
  source: SourceId;
  municipalities: string[];
  categories: CategoryConfig[];
  maxNewCandidatesPerRun: number;
  osm: OsmConfig;
}

const SUPPORTED_SOURCES: readonly SourceId[] = ['osm'];

/** Characters that would break an Overpass QL string literal. */
const UNSAFE_QL_CHARS = /["\\\n\r]/;

function fail(message: string): never {
  throw new Error(`Invalid config/search.json: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(`${path} must be a non-empty string`);
  if (UNSAFE_QL_CHARS.test(value)) fail(`${path} contains characters that are not allowed`);
  return value.trim();
}

function requirePositiveInt(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    fail(`${path} must be a positive integer`);
  }
  return value;
}

function requireNonNegativeInt(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    fail(`${path} must be a non-negative integer`);
  }
  return value;
}

/** Validates raw JSON and returns a typed config, or throws with a readable message. */
export function parseConfig(raw: unknown): SearchConfig {
  if (!isRecord(raw)) fail('root must be an object');

  const source = raw.source;
  if (typeof source !== 'string' || !SUPPORTED_SOURCES.includes(source as SourceId)) {
    fail(`source must be one of: ${SUPPORTED_SOURCES.join(', ')}`);
  }

  if (!Array.isArray(raw.municipalities) || raw.municipalities.length === 0) {
    fail('municipalities must be a non-empty array');
  }
  const municipalities = raw.municipalities.map((m, i) => requireString(m, `municipalities[${i}]`));

  if (!Array.isArray(raw.categories) || raw.categories.length === 0) {
    fail('categories must be a non-empty array');
  }
  const categories = raw.categories.map((c, i): CategoryConfig => {
    if (!isRecord(c)) fail(`categories[${i}] must be an object`);
    if (!isRecord(c.osmTag)) fail(`categories[${i}].osmTag must be an object`);
    return {
      id: requireString(c.id, `categories[${i}].id`),
      label: requireString(c.label, `categories[${i}].label`),
      osmTag: {
        key: requireString(c.osmTag.key, `categories[${i}].osmTag.key`),
        value: requireString(c.osmTag.value, `categories[${i}].osmTag.value`),
      },
    };
  });

  if (!isRecord(raw.osm)) fail('osm must be an object');
  const endpoint = requireString(raw.osm.endpoint, 'osm.endpoint');
  if (!endpoint.startsWith('https://')) fail('osm.endpoint must use https');

  return {
    source: source as SourceId,
    municipalities,
    categories,
    maxNewCandidatesPerRun: requirePositiveInt(raw.maxNewCandidatesPerRun, 'maxNewCandidatesPerRun'),
    osm: {
      endpoint,
      timeoutSeconds: requirePositiveInt(raw.osm.timeoutSeconds, 'osm.timeoutSeconds'),
      delayBetweenRequestsMs: requireNonNegativeInt(raw.osm.delayBetweenRequestsMs, 'osm.delayBetweenRequestsMs'),
    },
  };
}

export async function loadConfig(path: string): Promise<SearchConfig> {
  const text = await readFile(path, 'utf8');
  return parseConfig(JSON.parse(text));
}
