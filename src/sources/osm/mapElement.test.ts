import { describe, expect, it } from 'vitest';
import type { CategoryConfig } from '../../config';
import { mapElement, type OverpassElement } from './mapElement';

const categories: CategoryConfig[] = [
  { id: 'hairdresser', label: 'Parrucchiere', osmTag: { key: 'shop', value: 'hairdresser' } },
  { id: 'beauty', label: 'Estetista', osmTag: { key: 'shop', value: 'beauty' } },
];

describe('mapElement', () => {
  it('maps a node with full tags', () => {
    const element: OverpassElement = {
      type: 'node',
      id: 123,
      lat: 44.54,
      lon: 10.78,
      tags: {
        shop: 'hairdresser',
        name: ' Salone Anna ',
        'addr:street': 'Via Roma',
        'addr:housenumber': '10',
        'addr:postcode': '41049',
        'addr:city': 'Sassuolo',
        phone: '+39 0536 000000',
        'contact:email': 'info@example.com',
        'contact:instagram': '@salone_anna',
        opening_hours: 'Tu-Sa 09:00-19:00',
      },
    };

    expect(mapElement(element, 'Sassuolo', categories)).toEqual({
      leadKey: 'osm:node/123',
      source: 'osm',
      name: 'Salone Anna',
      categoryId: 'hairdresser',
      categoryLabel: 'Parrucchiere',
      municipality: 'Sassuolo',
      address: { street: 'Via Roma', houseNumber: '10', postcode: '41049', city: 'Sassuolo' },
      location: { lat: 44.54, lon: 10.78 },
      contacts: { phone: '+39 0536 000000', email: 'info@example.com' },
      links: ['https://www.instagram.com/salone_anna'],
      openingHours: 'Tu-Sa 09:00-19:00',
      sourceUrl: 'https://www.openstreetmap.org/node/123',
    });
  });

  it('uses the center point for ways', () => {
    const lead = mapElement(
      { type: 'way', id: 9, center: { lat: 1, lon: 2 }, tags: { shop: 'beauty', name: 'Estetica Luna' } },
      'Formigine',
      categories,
    );
    expect(lead?.location).toEqual({ lat: 1, lon: 2 });
    expect(lead?.categoryId).toBe('beauty');
    expect(lead?.leadKey).toBe('osm:way/9');
  });

  it('adds a scheme to bare websites and splits multi-value tags', () => {
    const lead = mapElement(
      {
        type: 'node',
        id: 1,
        tags: { shop: 'beauty', name: 'X', website: 'example.it; https://example.com', facebook: 'esteticax' },
      },
      'Maranello',
      categories,
    );
    expect(lead?.links).toEqual(['https://example.it', 'https://example.com', 'https://www.facebook.com/esteticax']);
  });

  it('returns null without a name', () => {
    expect(mapElement({ type: 'node', id: 2, tags: { shop: 'hairdresser' } }, 'Sassuolo', categories)).toBeNull();
  });

  it('returns null when no category matches', () => {
    expect(mapElement({ type: 'node', id: 3, tags: { shop: 'bakery', name: 'Forno' } }, 'Sassuolo', categories)).toBeNull();
  });
});
