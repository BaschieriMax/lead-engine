import type { WebStatus } from '../types';

/**
 * Hosts that do not count as the business's own website:
 * social networks, link-in-bio pages, messaging, directories and booking platforms.
 * A business found only on these is still a prospect for a website.
 */
const NOT_OWN_SITE_HOSTS = [
  'facebook.com',
  'fb.com',
  'fb.me',
  'instagram.com',
  'instagr.am',
  'tiktok.com',
  'youtube.com',
  'x.com',
  'twitter.com',
  'linkedin.com',
  'linktr.ee',
  'wa.me',
  'whatsapp.com',
  'paginegialle.it',
  'paginebianche.it',
  'treatwell.it',
  'treatwell.com',
  'fresha.com',
  'booksy.com',
  'uala.it',
  'google.com',
  'goo.gl',
  'g.page',
  'business.site',
] as const;

function hostnameOf(link: string): string | null {
  try {
    return new URL(link).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isNotOwnSite(hostname: string): boolean {
  return NOT_OWN_SITE_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

/**
 * Classifies a business from its known links.
 * - `none`: no usable link at all
 * - `social_only`: only social, directory or booking pages
 * - `has_site`: at least one link to another domain, assumed to be its own site
 *
 * The source data can be incomplete: `none` means "no site on record", and the
 * profiler must still verify it with a web search.
 */
export function classifyLinks(links: readonly string[]): WebStatus {
  const hostnames = links.map(hostnameOf).filter((h): h is string => h !== null && h.length > 0);
  if (hostnames.length === 0) return 'none';
  return hostnames.every(isNotOwnSite) ? 'social_only' : 'has_site';
}
