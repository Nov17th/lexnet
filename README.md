# LexNet: A Linked Open Data Approach to Trilingual Vocabulary Learning

LexNet is a Linked Open Data resource for Vietnamese learners of English and Chinese. Instead of a word-to-word translation table, it is a network of shared concepts: English, Vietnamese and Chinese words point to the same language-independent concept, concepts are linked by semantic relations, and a learner layer adds proficiency levels, register and usage examples to each word sense. Chinese words are also broken down into characters and radicals.

## Deliverables

- Report: [deliverables/report/LexNet-report.pdf](deliverables/report/LexNet-report.pdf)
- Slides: [deliverables/slides/LexNet-slides.pdf](deliverables/slides/LexNet-slides.pdf)
- Demo video: [deliverables/demo](deliverables/demo/README.md)

## Model

| Layer | Nodes | Main relations |
|---|---|---|
| Meaning | `lexnet:Concept` | `skos:broader` (is-a), `lexnet:antonym`, `lexnet:partMeronym`, `lexnet:inDomain` |
| Word | `ontolex:LexicalEntry`, `ontolex:LexicalSense`, `ontolex:Form` | `ontolex:evokes`, `ontolex:sense`, `lexnet:level`, `lexnet:register`, `lexnet:hasExample`, `lexnet:confusableWith` |
| Script | `lexnet:HanCharacter`, `lexnet:Radical` | `lexnet:hasCharacter`, `lexnet:hasRadical`, `lexnet:reading`, `lexnet:similarCharacter` |

- The ontology is OWL 2 DL (expressivity ALCROIQ(D), checked with the OWL API profile checker). It reuses OntoLex-Lemon, SKOS and LexInfo, declaring their terms exactly as the official vocabularies do.
- A reasoner infers polysemous words (`lexnet:PolysemousEntry`, two or more senses), translations and synonyms (`lexnet:sharesConceptWith`, the chain `evokes ∘ evokes⁻¹`) and the symmetric parent relation `confusableWith`. Disjoint node types, domains, ranges and `owl:AllDifferent` make it reject mistyped or conflicting data.
- Levels (CEFR, HSK 3.0) and topics are SKOS concept schemes. A level belongs to a sense, not a word: *bank* is A1 as a financial institution and B1 as the side of a river.
- Concepts link to Wikidata items (`skos:exactMatch`, `skos:closeMatch`) and words to Wikidata lexemes (`owl:sameAs`). Audio recordings are fetched from the lexemes with federated SPARQL.
- Every IRI can be looked up. Data IRIs are hash IRIs into `build/lexnet-full.ttl` (e.g. `https://nov17th.github.io/lexnet/build/lexnet-full.ttl#concept/cat`) and vocabulary IRIs point into `ontology/lexnet-ontology.ttl`. GitHub Pages serves both files as Turtle, so looking up an IRI returns the triples that describe it.
- Pronunciation is stored on the form (`ontolex:phoneticRep`): pinyin with tones, checked syllable by syllable against Unihan and the HSK syllabus, and General American IPA from the CMU Pronouncing Dictionary.
- Homophones are derived at build time: two words of one language with the same pronunciation get `lexnet:similarSound` (sea/see, 心/新). OWL 2 DL cannot express this rule because it compares literal values of two individuals.
- Look-alike Han characters are linked once, as characters (白/百, 午/牛), so every word that contains them is covered, compounds included. `similarCharacter` is not a subproperty of `confusableWith`, whose domain is words; otherwise the reasoner would infer that a character is a word.

## Repository

```
ontology/   lexnet-ontology.ttl        ontology, levels and registers
data/       lexnet-topics.csv          topics
            lexnet-concepts.csv        one row per concept
            lexnet-entries.csv         one row per word sense (a word used for a concept)
            lexnet-confusables.csv     hand-picked confusable pairs (look-alike or close in meaning), English and Chinese
            hanzi-unihan.tsv           radicals, strokes and readings from Unihan
scripts/    import_sheet.py            copies the team spreadsheet (.xlsx) into data/*.csv
            csv_to_ttl.py              builds build/lexnet-full.ttl, derives homophones, prints warnings
            check_build.py             checks the build: SKOS integrity, labels, HermiT reasoning, demo queries
            report_stats.py            writes deliverables/report/stats.tex, every number used in the report
            lookup_wikidata.py         suggests Wikidata links for review
            build_hanzi_data.py        rebuilds data/hanzi-unihan.tsv from Unihan
            en_ipa.py                  English IPA from the CMU Pronouncing Dictionary
            candidates_to_rows.py      turns picked concept candidates into spreadsheet rows
queries/    queries.rq                 18 demo SPARQL queries, 3 of them federated with Wikidata
web/                                  Next.js dictionary, graph explorer and SPARQL interface
build/      lexnet-full.ttl            ontology + data, generated; do not edit
deliverables/
            report/                    LexNet-report.pdf, stats.tex (numbers from report_stats.py), figures/
            slides/                    LexNet-slides.pdf
            demo/                      link to the demo video
```

The data is edited in a shared spreadsheet and exported to `data/` with `import_sheet.py`; the CSV files are not edited by hand.

## Running

Requirements: Python 3, Java 21 and Apache Jena Fuseki 6.2.0. `import_sheet.py` and `csv_to_ttl.py` use only the standard library; `check_build.py` and `report_stats.py` need `pip install rdflib owlready2` (owlready2 ships the HermiT reasoner).

```bash
python3 scripts/import_sheet.py LexNet-data.xlsx     # refresh data/ from the spreadsheet
python3 scripts/csv_to_ttl.py                        # build the knowledge graph
python3 scripts/check_build.py                       # PASS/FAIL per check, about 2 minutes
python3 scripts/report_stats.py [--online]           # numbers for the report (--online: also Wikidata coverage)
fuseki-server --file build/lexnet-full.ttl /lexnet   # SPARQL endpoint at http://localhost:3030
```

Run the queries in `queries/queries.rq` one at a time in Fuseki, or open `build/lexnet-full.ttl` in Protégé and start HermiT to see the inferences. With a local `ref/` folder holding the official word lists (not distributed), `csv_to_ttl.py` also checks every level, pinyin and IPA against them.

## Web application

The [web application](web/README.md) provides a multilingual dictionary, topic filters, a graph explorer and a read-only SPARQL console. It queries Fuseki at runtime and reads the generated `build/lexnet-full.ttl` without copying or modifying the dataset.

See [web/README.md](web/README.md) for installation, configuration, local startup and checks. GitHub Pages serves the published RDF and ontology; running the web application requires Node.js and a SPARQL endpoint.

## Data sources

| Source | Used for | Licence |
|---|---|---|
| Wikidata (items, lexemes) | links, multilingual labels, pronunciation, pinyin cross-check | CC0 |
| Unicode Unihan | radicals, readings, stroke counts | Unicode License v3 |
| Make Me a Hanzi | stroke counts in the mainland standard | Arphic Public License |
| Oxford 3000 and 5000 by CEFR level (American English), OUP | English levels, per sense where Oxford splits them; concept selection | published list, used as reference |
| HSK 3.0 syllabus (November 2025), CTI | Chinese levels and pinyin; concept selection | published list, used as reference |
| CMU Pronouncing Dictionary | English IPA, homophones | BSD 2-Clause |
| Princeton WordNet, Swadesh list (via NLTK) | topic suggestions and basic-vocabulary priority during concept selection | WordNet License; Swadesh list from Wiktionary (CC BY-SA), not redistributed |
| CC-CEDICT, Vietnamese WordNet | cross-checking translations during review | CC BY-SA / open |

## Licence

The ontology and the data are published under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), declared with `dct:license` in the ontology header. Character data from Unihan and IPA from the CMU Pronouncing Dictionary keep the attributions above.

## Status

The data is final: 236 concepts in 11 topics and 774 word senses in three languages. Levels, pinyin, IPA, Wikidata items and lexemes were filled in automatically from the sources above, then reviewed row by row by the team, who also wrote a usage example for every English and Chinese sense.
