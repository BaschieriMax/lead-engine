# lead-engine

Ogni notte trova parrucchieri ed estetiste della zona che su OpenStreetMap non hanno un sito, scarta quelli già visti e salva i candidati nel repository. Alle 06:50 un'attività pianificata di Claude li legge, verifica con una ricerca web che il sito manchi davvero, li profila e prepara il report delle 9:00.

## Come funziona

1. GitHub Actions (`.github/workflows/nightly.yml`) parte alle 01:00 UTC.
2. `src/index.ts` legge `config/search.json` e interroga la fonte scelta (oggi solo `osm`, tramite Overpass API).
3. Ogni attività viene classificata dai link che conosciamo:
   - `none` — nessun link
   - `social_only` — solo social, directory o piattaforme di prenotazione
   - `has_site` — almeno un sito proprio (scartata)
4. Le nuove attività senza sito vengono scritte in `data/candidates/latest.json`, al massimo `maxNewCandidatesPerRun` per notte; quelle in eccesso tornano la notte dopo.
5. `data/seen.json` registra solo `leadKey`, data di prima scoperta e classificazione, per non riproporre gli stessi lead.

`none` significa "nessun sito su OpenStreetMap", non "nessun sito": la verifica vera la fa il profiler.

## Comandi

```bash
npm install
npm test           # Vitest
npm run typecheck  # tsc --noEmit
npm run find       # esegue la ricerca e aggiorna data/
```

## Configurazione

`config/search.json`:

| Campo | Significato |
| --- | --- |
| `source` | Fonte dei lead. Oggi: `osm` |
| `municipalities` | Comuni da cercare (confini amministrativi, livello 8) |
| `categories` | Settori, con il tag OSM corrispondente |
| `maxNewCandidatesPerRun` | Tetto di nuovi candidati per notte |
| `osm.delayBetweenRequestsMs` | Pausa tra le query, per rispettare l'istanza pubblica Overpass |

Per aggiungere una fonte: implementa `LeadSource` in `src/sources/` e registrala in `createSource.ts`. Il resto della pipeline non cambia.

## Dati e licenze

I dati provengono da © OpenStreetMap contributors, licenza ODbL (https://www.openstreetmap.org/copyright). Il campo `attribution` di `latest.json` va mostrato nel report e nella Lead Board.

Il sistema non contatta nessuna attività: prepara i lead, il primo contatto è sempre umano.
