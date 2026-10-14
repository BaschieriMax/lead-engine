# lead-engine

Trova parrucchieri ed estetiste della zona senza un sito proprio e prepara ogni mattina un report dei potenziali clienti. Costo: 0 €.

## I tre canali di scoperta

| Canale | Chi lo fa | Quando | Chiave del lead |
| --- | --- | --- | --- |
| OpenStreetMap | GitHub Actions, questo script | Ogni notte, 01:00 UTC | `osm:<tipo>/<id>` (es. `osm:node/123456`) |
| Ricerca web | Claude, nel giro del mattino | Ogni mattina, 06:50 | `web:<nome>-<comune>` in minuscolo, senza accenti, con trattini |
| Segnalazioni manuali | Tu, con il modulo **Nuovo lead** nelle Issues | Quando vuoi | `manual:<numero issue>` |

Tutti e tre finiscono nello stesso flusso: Claude verifica che il sito manchi davvero, profila il lead, lo scrive nella Lead Board e lo inserisce nel report delle 9:00. Prima di aggiungere un lead da ricerca web o segnalazione, controlla per nome e comune che non esista già.

**Segnalare un lead**: dall'app GitHub o dal browser, *Issues → New issue → Nuovo lead*. La mattina dopo Claude profila la segnalazione, commenta l'issue con l'esito e la chiude. Va bene anche guardare Google Maps a mano e segnalare le schede senza il pulsante "Sito web": è il normale uso del servizio. Quello che i termini di Google vietano è l'estrazione automatica.

## Come funziona lo script notturno

1. GitHub Actions (`.github/workflows/nightly.yml`) parte alle 01:00 UTC.
2. `src/index.ts` legge `config/search.json` e interroga la fonte scelta (oggi solo `osm`, tramite Overpass API).
3. Ogni attività viene classificata dai link che conosciamo:
   - `none` — nessun link
   - `social_only` — solo social, directory o piattaforme di prenotazione
   - `has_site` — almeno un sito proprio (scartata)
4. Le nuove attività senza sito entrano nella **coda** `data/candidates/latest.json` (campo `candidates`), al massimo `maxNewCandidatesPerRun` per notte; quelle in eccesso tornano la notte dopo.
5. La coda si accumula da una notte all'altra: ogni candidato resta finché il giro lead non lo elabora. Lo script toglie dalla coda le chiavi già presenti in `data/leads-index.json`, sia che il lead sia stato profilato sia che sia stato scartato. Se la ricerca fallisce, la coda resta com'era.
6. Ogni candidato ha `queuedOn`, la data di ingresso in coda. L'ordine è: prima chi non ha nessun link, poi i più vecchi, poi per nome.
7. `data/seen.json` registra solo `leadKey`, data di prima scoperta e classificazione, per non riproporre gli stessi lead.

Il giro lead parte solo su richiesta di Massimo: tra un giro e l'altro la coda cresce e non si perde nulla.

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
| `osm.endpoints` | Istanze Overpass, provate in ordine: se una è occupata si passa alla successiva |
| `osm.delayBetweenRequestsMs` | Pausa tra una query e l'altra, una alla volta e mai in parallelo |
| `osm.retryPauseMs` | Pausa prima del secondo giro su tutte le istanze (la policy Overpass chiede 30 s) |

Non usiamo l'istanza principale `overpass-api.de`: la sua policy chiede che l'uso commerciale passi da server propri o a pagamento. Le istanze in elenco non hanno limiti dichiarati, ma vanno usate con moderazione: una query per comune a notte.

Per aggiungere una fonte: implementa `LeadSource` in `src/sources/` e registrala in `createSource.ts`. Il resto della pipeline non cambia.

## Dati e licenze

I dati provengono da © OpenStreetMap contributors, licenza ODbL (https://www.openstreetmap.org/copyright). Il campo `attribution` di `latest.json` va mostrato nel report e nella Lead Board.

Il sistema non contatta nessuna attività: prepara i lead, il primo contatto è sempre umano.
