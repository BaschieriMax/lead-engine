import type { SearchConfig } from '../config';
import type { LeadSource } from './LeadSource';
import { OsmSource } from './osm/OsmSource';

/** Returns the source selected in config/search.json. */
export function createSource(config: SearchConfig): LeadSource {
  switch (config.source) {
    case 'osm':
      return new OsmSource(config.osm);
  }
}
