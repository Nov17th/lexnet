# LexNet web application

A read-only dictionary and graph explorer for the LexNet English, Vietnamese and Chinese knowledge graph. The browser calls the Next.js API, which queries a Fuseki SPARQL endpoint at runtime.

## Features

- Search words, inspect senses, translations, synonyms, proficiency levels and examples.
- Explore semantic relations, confusable words, Han characters and radicals.
- Browse topics and filter senses by language and proficiency rank.
- View dataset counts, coverage, bounded graph neighborhoods and results derived by SPARQL.
- Run SELECT, ASK, CONSTRUCT and DESCRIBE queries in the SPARQL console. Updates are rejected by both the app and the supplied Fuseki launcher.
- Retrieve pronunciation audio on demand from linked Wikidata lexemes. This uses a separate Wikidata request; local dictionary queries do not depend on Wikidata availability.

## Requirements

- Node.js 22 or later and npm. Dependencies are locked in `package-lock.json`.
- Java 21 and Apache Jena Fuseki 6.2.0, or a compatible existing SPARQL endpoint.
- The generated `../build/lexnet-full.ttl`, which includes the ontology and data.

On Windows, the optional portable setup installs Node.js, Java and Fuseki under `web/.tools/` and verifies their download checksums:

```powershell
cd web
./scripts/setup-runtime.ps1
. ./scripts/use-local-runtime.ps1
```

If you already have the runtimes, use your installed Node.js and set `FUSEKI_HOME` and `JAVA_HOME` in `.env.local` as needed.

## Run locally

Run these commands from `web/`:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run fuseki
```

On Linux or macOS, use `cp .env.example .env.local` for the copy step. Keep Fuseki running and open a second terminal in `web/`:

```powershell
# Use this line only if you installed the portable Windows runtime:
. ./scripts/use-local-runtime.ps1
npm run dev
```

- Application: <http://127.0.0.1:3000>
- Connection status: <http://127.0.0.1:3000/api/health>
- SPARQL endpoint: <http://localhost:3030/lexnet/query>

Do not overwrite an existing `.env.local` when it contains your own configuration. Local configuration, installed dependencies, runtime downloads and build output are ignored by Git.

## Data and namespaces

The app reads the repository's generated RDF directly. It does not duplicate the RDF, edit CSV data or use a second database. Queries and ontology definitions remain in `../queries/` and `../ontology/`.

```dotenv
SPARQL_ENDPOINT=http://localhost:3030/lexnet/query
LEXNET_RESOURCE_BASE="https://nov17th.github.io/lexnet/build/lexnet-full.ttl#"
LEXNET_SCHEMA_IRI="https://nov17th.github.io/lexnet/ontology/lexnet-ontology.ttl#"
LEXNET_RDF_FILE=../build/lexnet-full.ttl
```

Keep quotes around namespace values containing `#`, so environment-file parsers preserve the fragment delimiter. Internal links encode the complete resource IRI in the URL query string.

GitHub Pages publishes the [RDF dataset](https://nov17th.github.io/lexnet/build/lexnet-full.ttl) and [ontology](https://nov17th.github.io/lexnet/ontology/lexnet-ontology.ttl). The Next.js server and Fuseki run separately; publishing this source folder on Pages does not run either service.

After updating or rebuilding the RDF, stop and restart Fuseki, then refresh the app. Restart the web server when changing endpoint or namespace configuration. Levels and relations are displayed as recorded in the loaded RDF; the app does not run an OWL reasoner.

## Checks and production

From `web/`:

```sh
npm run lint
npm test
npm run build
npm run typecheck
npm run start
```

With the web application and Fuseki running, use `npm run test:integration`. The integration runner loads `.env.local`, checks the HTTP routes and real SPARQL results, and starts a separate temporary Fuseki instance on port 3031 to test dataset replacement, optional fields, repeated characters, empty data and outages. It does not modify the repository RDF. Set `TEST_APP_URL` when testing a web server on a different port.

External audio availability depends on Wikidata and Wikimedia. Browser layout, keyboard interaction, graph controls and actual audio playback should also be checked manually before recording a demo.

Verified in this repository layout: lint, production build, TypeScript, 9 contract tests and 18 integration groups passed. Development startup and search also passed. The runtime dependency audit reported no vulnerabilities; the full audit reported five high findings in development lint dependencies.

## Source layout

```text
src/app/          Next.js pages and API handlers
src/components/   Dictionary, topics, developer tools and graph views
src/lib/          SPARQL queries, result models, namespaces and audio adapter
scripts/          Fuseki launcher, optional runtime setup and integration checks
tests/            Contract tests independent of the live dataset
```
