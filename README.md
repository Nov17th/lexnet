# LexNet: A Linked Open Data Approach to Trilingual Vocabulary Learning

LexNet is a Linked Open Data resource for Vietnamese learners of English and Chinese. Instead of a word-to-word translation table, it is a network of shared concepts: English, Vietnamese and Chinese words point to the same language-independent concept, concepts are linked by semantic relations, and a learner layer adds proficiency levels, register and usage examples to word senses. Chinese words are also broken down into characters and radicals.

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

- The ontology is OWL 2 DL (expressivity ALCROIQ(D), checked with the OWL API profile checker in `scripts/ProfileCheck.java`). It reuses OntoLex-Lemon, SKOS and LexInfo, declaring their terms exactly as the official vocabularies do.
- A reasoner infers polysemous words (`lexnet:PolysemousEntry`, two or more senses), translations and synonyms (`lexnet:sharesConceptWith`, the chain `evokes ∘ evokes⁻¹`) and the symmetric parent relation `confusableWith`. Disjoint node types, domains, ranges and `owl:AllDifferent` make it reject mistyped or conflicting data.
- Levels (CEFR, HSK 3.0) and topics are SKOS concept schemes. A level belongs to a sense, not a word: *bank* is A1 as a financial institution and B1 as the side of a river.
- Concepts link to Wikidata items (`skos:exactMatch`, `skos:closeMatch`) and words to Wikidata lexemes (`owl:sameAs`). A federated query and the web application fetch audio recordings from the lexemes.
- Every IRI can be looked up. Data IRIs are hash IRIs into `build/lexnet-full.ttl` (e.g. `https://nov17th.github.io/lexnet/build/lexnet-full.ttl#concept/cat`) and vocabulary IRIs point into `ontology/lexnet-ontology.ttl`. GitHub Pages serves both files as Turtle, so looking up an IRI returns the whole file, which contains the triples that describe it.
- Pronunciation is stored on the form (`ontolex:phoneticRep`): pinyin with tones, checked syllable by syllable against Unihan and the HSK syllabus, and General American IPA from the CMU Pronouncing Dictionary.
- Homophones are derived at build time: two words of one language with the same pronunciation get `lexnet:similarSound` (sea/see, 心/新). OWL 2 DL cannot infer from two equal pronunciations that two different words sound alike.
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
            ProfileCheck.java          checks the OWL 2 profiles (DL, EL, QL, RL) with the OWL API
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
java -cp <owlapi jar> scripts/ProfileCheck.java build/lexnet-full.ttl   # OWL 2 profiles; see the file header
fuseki-server --file build/lexnet-full.ttl /lexnet   # SPARQL endpoint at http://localhost:3030
```

Run the queries in `queries/queries.rq` one at a time in Fuseki, or open `build/lexnet-full.ttl` in Protégé and start HermiT to see the inferences. With a local `ref/` folder holding the official word lists (not distributed), `csv_to_ttl.py` also checks every level, pinyin and IPA against them; without it, words that have no level are listed as warnings to review.

## Web application

The [web application](web/README.md) provides a multilingual dictionary, topic filters, a graph explorer and a read-only SPARQL console. It queries Fuseki at runtime and reads the generated `build/lexnet-full.ttl` without copying or modifying the dataset.

See [web/README.md](web/README.md) for installation, configuration, local startup and checks. GitHub Pages serves the published RDF and ontology; running the web application requires Node.js and a SPARQL endpoint.

## Data sources

| Source | Used for | Licence or use |
|---|---|---|
| Oxford 3000 and 5000 by CEFR level (American English), OUP | concept candidates; English levels, per sense where Oxford splits them | published list, not redistributed |
| HSK 3.0 syllabus (November 2025), CTI | concept candidates; Chinese levels and pinyin | published list, not redistributed |
| Oxford Learner's Dictionaries, CC-CEDICT, HSK Standard Course | meanings, register labels and confusable pairs during review; CC-CEDICT also matched English and Chinese candidates | consulted only |
| Princeton WordNet | topic suggestions during concept selection; hypernymy and part relations during review | consulted only |
| Swadesh list (via NLTK) | basic-vocabulary priority during concept selection | consulted only |
| CMU Pronouncing Dictionary | English IPA, homophones | BSD 2-Clause |
| Unicode Unihan | radicals, readings, definitions; stroke counts for characters outside the PRC standard list | Unicode License v3 |
| Make Me a Hanzi | stroke counts in the mainland standard | Arphic Public License |
| Wikidata (items, lexemes) | links; labels, recordings and pinyin through federated queries | CC0 |

## Licence

The ontology, the data and the scripts are published under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The full text is in [`LICENSE`](LICENSE), and the ontology header declares the licence with `dct:license`. Character data from Unihan and IPA from the CMU Pronouncing Dictionary keep the attributions above.

## Status

The data is final: 236 concepts in 11 topics, 759 words and 774 word senses in three languages. Levels, pinyin and IPA were pre-filled from the word lists and the CMU Pronouncing Dictionary, and Wikidata items and lexemes were suggested by `lookup_wikidata.py`. The team then reviewed every concept, sense and confusable pair, corrected or added words, relations, levels, registers and links, and completed the usage examples, one for each English and Chinese sense.
