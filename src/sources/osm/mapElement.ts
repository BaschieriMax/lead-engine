import type { CategoryConfig } from '../../config';
import type { Address, Contacts, GeoPoint, Lead } from '../../types';

/** Subset of an Overpass element we rely on (`out tags center`). */
export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const WEBSITE_KEYS = ['website', 'contact:website', 'url', 'contact:url'] as const;
const FACEBOOK_KEYS = ['facebook', 'contact:facebook'] as const;
const INSTAGRAM_KEYS = ['instagram', 'contact:instagram'] as const;
const OTHER_SOCIAL_KEYS = ['contact:tiktok', 'contact:youtube'] as const;

/** OSM allows several values in one tag, separated by `;`. */
function splitValues(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(';')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function withScheme(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/** Social tags often hold a bare handle instead of a URL. */
function socialUrl(value: string, baseUrl: string): string {
  if (/^https?:\/\//i.test(value) || value.includes('.')) return withScheme(value);
  return `${baseUrl}${value.replace(/^@/, '')}`;
}

function pick(tags: Record<string, string>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = tags[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function collectLinks(tags: Record<string, string>): string[] {
  const links = [
    ...WEBSITE_KEYS.flatMap((k) => splitValues(tags[k]).map(withScheme)),
    ...FACEBOOK_KEYS.flatMap((k) => splitValues(tags[k]).map((v) => socialUrl(v, 'https://www.facebook.com/'))),
    ...INSTAGRAM_KEYS.flatMap((k) => splitValues(tags[k]).map((v) => socialUrl(v, 'https://www.instagram.com/'))),
    ...OTHER_SOCIAL_KEYS.flatMap((k) => splitValues(tags[k]).map(withScheme)),
  ];
  return [...new Set(links)];
}

function toAddress(tags: Record<string, string>): Address {
  const address: Address = {};
  if (tags['addr:street']) address.street = tags['addr:street'];
  if (tags['addr:housenumber']) address.houseNumber = tags['addr:housenumber'];
  if (tags['addr:postcode']) address.postcode = tags['addr:postcode'];
  if (tags['addr:city']) address.city = tags['addr:city'];
  return address;
}

function toContacts(tags: Record<string, string>): Contacts {
  const contacts: Contacts = {};
  const phone = pick(tags, ['phone', 'contact:phone', 'contact:mobile', 'mobile']);
  const email = pick(tags, ['email', 'contact:email']);
  if (phone) contacts.phone = phone;
  if (email) contacts.email = email;
  return contacts;
}

function toLocation(element: OverpassElement): GeoPoint | null {
  if (element.lat !== undefined && element.lon !== undefined) return { lat: element.lat, lon: element.lon };
  if (element.center) return { lat: element.center.lat, lon: element.center.lon };
  return null;
}

/**
 * Maps one Overpass element to a Lead.
 * Returns null when the element has no name or matches none of the categories.
 */
export function mapElement(
  element: OverpassElement,
  municipality: string,
  categories: CategoryConfig[],
): Lead | null {
  const tags = element.tags ?? {};
  const name = tags.name?.trim();
  if (!name) return null;

  const category = categories.find(({ osmTag }) => tags[osmTag.key] === osmTag.value);
  if (!category) return null;

  const lead: Lead = {
    leadKey: `osm:${element.type}/${element.id}`,
    source: 'osm',
    name,
    categoryId: category.id,
    categoryLabel: category.label,
    municipality,
    address: toAddress(tags),
    location: toLocation(element),
    contacts: toContacts(tags),
    links: collectLinks(tags),
    sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
  };

  const openingHours = tags.opening_hours?.trim();
  if (openingHours) lead.openingHours = openingHours;

  return lead;
}
