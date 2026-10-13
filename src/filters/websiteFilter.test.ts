import { describe, expect, it } from 'vitest';
import { classifyLinks } from './websiteFilter';

describe('classifyLinks', () => {
  it('returns none when there are no links', () => {
    expect(classifyLinks([])).toBe('none');
  });

  it('returns none when every link is malformed', () => {
    expect(classifyLinks(['not a url', 'https://'])).toBe('none');
  });

  it('returns social_only for social, link-in-bio and booking pages', () => {
    expect(
      classifyLinks([
        'https://www.facebook.com/salone.anna',
        'https://instagram.com/salone_anna',
        'https://linktr.ee/salone_anna',
        'https://www.treatwell.it/salone/salone-anna/',
        'https://wa.me/393331234567',
      ]),
    ).toBe('social_only');
  });

  it('treats subdomains of excluded hosts as not own site', () => {
    expect(classifyLinks(['https://m.facebook.com/salone', 'https://it-it.facebook.com/salone'])).toBe('social_only');
  });

  it('returns has_site when one link is an own domain', () => {
    expect(classifyLinks(['https://www.facebook.com/salone', 'https://www.saloneanna.it'])).toBe('has_site');
  });

  it('does not confuse lookalike domains with excluded hosts', () => {
    expect(classifyLinks(['https://notfacebook.com'])).toBe('has_site');
  });
});
