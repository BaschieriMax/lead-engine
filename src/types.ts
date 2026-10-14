/** Identifier of the data source a lead was discovered from. */
export type SourceId = 'osm';

/** Unique key of a lead, prefixed by its source (e.g. `osm:node/123456`). */
export type LeadKey = `${SourceId}:${string}`;

/** How present the business is on the web, judged from the links we know. */
export type WebStatus = 'none' | 'social_only' | 'has_site';

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface Address {
  street?: string;
  houseNumber?: string;
  postcode?: string;
  city?: string;
}

export interface Contacts {
  phone?: string;
  email?: string;
}

/** A business as returned by a source, before website classification. */
export interface Lead {
  leadKey: LeadKey;
  source: SourceId;
  name: string;
  categoryId: string;
  categoryLabel: string;
  municipality: string;
  address: Address;
  location: GeoPoint | null;
  contacts: Contacts;
  /** Every web link found for the business (site, social, booking pages). */
  links: string[];
  openingHours?: string;
  /** Public page of the record at the source, for verification and attribution. */
  sourceUrl: string;
}

/** A lead after website classification. */
export interface Candidate extends Lead {
  webStatus: WebStatus;
}

/** A candidate waiting in the queue until the lead run processes it. */
export interface QueuedCandidate extends Candidate {
  /** Run date (YYYY-MM-DD, Europe/Rome) when the candidate entered the queue. */
  queuedOn: string;
}

export interface SourceError {
  municipality: string;
  message: string;
}

export interface SourceResult {
  leads: Lead[];
  errors: SourceError[];
  /** Records returned by the source but skipped (e.g. no name). */
  skipped: number;
}
