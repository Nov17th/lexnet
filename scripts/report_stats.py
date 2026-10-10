#!/usr/bin/env python3
"""
Compute every number quoted in the report and write them to deliverables/report/stats.tex as LaTeX macros
(\\lxConcepts and so on). To update the report, run this again and re-upload stats.tex.

    python3 scripts/report_stats.py             # after csv_to_ttl.py
    python3 scripts/report_stats.py --online    # also recount audio files and descriptions on Wikidata

Needs rdflib.
"""
import csv, json, re, sys, time, urllib.parse, urllib.request
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
BUILD, QUERIES, OUT = ROOT / "build" / "lexnet-full.ttl", ROOT / "queries" / "queries.rq", ROOT / "deliverables" / "report" / "stats.tex"
ONLINE = "--online" in sys.argv

# Numbers from other tools; update by hand when the ontology or the checks change
MANUAL = {
    "lxTBoxAxioms": "139",         # logical axioms of ontology/lexnet-ontology.ttl (OWL API)
    "lxTBoxClasses": "15",         # named classes (OWL API lists 16, counting owl:Thing)
    "lxTBoxObjProps": "25",
    "lxTBoxDataProps": "9",
    "lxTBoxIndividuals": "24",     # levels, registers, parts of speech, schemes
    "lxExpressivity": "$\\mathcal{ALCROIQ}(\\mathcal{D})$",
    "lxFaultsTotal": "12",         # check_build.py, injected faults
    "lxFaultsCaught": "12",
}
# Counted on Wikidata; without --online the previous values are kept
ONLINE_KEYS = ["lxAudioEn", "lxAudioZh", "lxAudioVi", "lxDescItems", "lxDescEn", "lxDescVi", "lxDescZh"]

try:
    import rdflib
    from rdflib import RDF, Namespace
except ImportError:
    sys.exit("Needs rdflib:  pip install rdflib")

def rows(path):
    with open(path, encoding="utf-8-sig") as f:
        return [{k: (v or "").strip() for k, v in r.items()} for r in csv.DictReader(f)]

def pct(a, b):
    return f"{100 * a / b:.1f}" if b else "--"

S = {}
concepts, entries, confs = rows(DATA / "lexnet-concepts.csv"), rows(DATA / "lexnet-entries.csv"), rows(DATA / "lexnet-confusables.csv")
pos_of = {c["concept_id"]: c["pos"] for c in concepts}
LANG_NAME = {"en": "En", "vi": "Vi", "zh": "Zh"}

# Data (CSV)
S["lxTopics"] = len({c["topic"] for c in concepts})
S["lxConcepts"] = len(concepts)
S["lxSenses"] = len(entries)
words = defaultdict(set)                          # word = (language, written form, part of speech)
for e in entries:
    words[e["lang"]].add((e["word"], pos_of.get(e["concept_id"], "")))
S["lxEntries"] = sum(len(v) for v in words.values())
for l, L in LANG_NAME.items():
    sense_rows = [e for e in entries if e["lang"] == l]
    S[f"lxSenses{L}"] = len(sense_rows)
    S[f"lxEntries{L}"] = len(words[l])
    S[f"lxLexeme{L}"] = len({(e["word"], pos_of.get(e["concept_id"])) for e in sense_rows if e["wikidata_lexeme"]})
    S[f"lxLevel{L}"] = sum(1 for e in sense_rows if e["level"])
    S[f"lxExamples{L}"] = sum(1 for e in sense_rows if e["example"])
S["lxRegisterSenses"] = sum(1 for e in entries if e["register"])
S["lxIpaEn"] = len({(e["word"], pos_of.get(e["concept_id"])) for e in entries if e["lang"] == "en" and e["ipa"]})
S["lxPinyinZh"] = len({(e["word"], pos_of.get(e["concept_id"])) for e in entries if e["lang"] == "zh" and e["pinyin"]})
S["lxLexemeAll"] = S["lxLexemeEn"] + S["lxLexemeVi"] + S["lxLexemeZh"]
S["lxExactMatch"] = sum(1 for c in concepts if c["wikidata"])
S["lxCloseMatch"] = sum(1 for c in concepts if c["close_match"])
S["lxConceptsLinked"] = sum(1 for c in concepts if c["wikidata"] or c["close_match"])
S["lxConceptsUnlinked"] = S["lxConcepts"] - S["lxConceptsLinked"]
S["lxGlossed"] = sum(1 for c in concepts if c["gloss_en"])
syn = defaultdict(set)
for e in entries:
    syn[(e["concept_id"], e["lang"])].add(e["word"])
S["lxSynonymSets"] = sum(1 for v in syn.values() if len(v) > 1)
single = lambda w: len(w) == 1
S["lxConfMeaning"] = sum(1 for r in confs if r["type"] == "meaning")
S["lxCharPairs"] = sum(1 for r in confs if r["lang"] == "zh" and r["type"] == "glyph" and single(r["word1"]) and single(r["word2"]))
zh_words = {e["word"] for e in entries if e["lang"] == "zh"}
S["lxConfGlyphWords"] = sum(1 for r in confs if r["type"] == "glyph" and r["word1"] in {e["word"] for e in entries if e["lang"] == r["lang"]}
                            and r["word2"] in {e["word"] for e in entries if e["lang"] == r["lang"]})
S["lxConfRows"] = len(confs)
S["lxQueries"] = len(re.findall(r"(?m)^# --- \d+\)", QUERIES.read_text(encoding="utf-8")))
S["lxFederated"] = 3

# Build (RDF)
g = rdflib.Graph(); g.parse(BUILD, format="turtle")
L_ = Namespace(dict(g.namespaces())["lexnet"]); OL = Namespace("http://www.w3.org/ns/lemon/ontolex#")
SK = Namespace("http://www.w3.org/2004/02/skos/core#")
q = lambda text: list(g.query(f"""PREFIX lexnet:<{L_}> PREFIX ontolex:<http://www.w3.org/ns/lemon/ontolex#>
PREFIX skos:<http://www.w3.org/2004/02/skos/core#> PREFIX owl:<http://www.w3.org/2002/07/owl#> """ + text))
S["lxTriples"] = f"{len(g):,}".replace(",", "{,}")
S["lxChars"] = len(set(g.subjects(RDF.type, L_.HanCharacter)))
S["lxRadicals"] = len(set(g.subjects(RDF.type, L_.Radical)))
S["lxPolyphonic"] = len(q("SELECT ?c WHERE { ?c lexnet:reading ?r } GROUP BY ?c HAVING(COUNT(?r) > 1)"))
S["lxPolysemous"] = len(q("SELECT ?e WHERE { ?e ontolex:sense ?s } GROUP BY ?e HAVING(COUNT(?s) > 1)"))
S["lxBroader"] = len(list(g.subject_objects(SK.broader)))
S["lxMeronym"] = len(list(g.subject_objects(L_.partMeronym)))
S["lxAntonymPairs"] = len({frozenset(p) for p in g.subject_objects(L_.antonym)})
S["lxHomophonePairs"] = len({frozenset(p) for p in g.subject_objects(L_.similarSound)})
S["lxConfWordPairs"] = len({frozenset(p) for prop in (L_.similarGlyph, L_.similarMeaning, L_.similarSound)
                            for p in g.subject_objects(prop)})
S["lxSameAs"] = len(q("SELECT DISTINCT ?e WHERE { ?e a ontolex:LexicalEntry ; owl:sameAs ?l }"))
# Row counts of the offline demo queries: \lxQrowsOne ... \lxQrowsEighteen
NUM = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
       "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen", "Twenty"]
parts = re.split(r"(?m)^# --- (\d+)\)", QUERIES.read_text(encoding="utf-8"))
for i in range(1, len(parts), 2):
    n = int(parts[i])
    if "SERVICE" in parts[i + 1] or n >= len(NUM):
        continue
    S[f"lxQrows{NUM[n]}"] = len(list(g.query("#" + parts[i + 1])))

# Wikidata coverage
old = {}
if OUT.exists():
    for k, v in re.findall(r"\\newcommand\{\\(lx\w+)\}\{(.*)\}", OUT.read_text(encoding="utf-8")):
        old[k] = v
if ONLINE:
    UA = {"User-Agent": "LexNet-student-project/1.0 (semantic web course)"}
    def wdqs(text):
        url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": text, "format": "json"})
        r = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120))["results"]["bindings"]
        time.sleep(1)
        return r
    for l, L in LANG_NAME.items():
        ids = sorted({e["wikidata_lexeme"] for e in entries if e["lang"] == l and e["wikidata_lexeme"]})
        n = 0
        if ids:
            n = int(wdqs("SELECT (COUNT(DISTINCT ?l) AS ?n) WHERE { VALUES ?l { " + " ".join("wd:" + i for i in ids)
                         + " } ?l ontolex:lexicalForm/wdt:P443 ?a }")[0]["n"]["value"])
        S[f"lxAudio{L}"] = n
    items = sorted({x for c in concepts for x in (c["wikidata"], c["close_match"]) if x})
    S["lxDescItems"] = len(items)
    got = {b["lang"]["value"]: b["n"]["value"] for b in wdqs(
        "SELECT ?lang (COUNT(DISTINCT ?i) AS ?n) WHERE { VALUES ?i { " + " ".join("wd:" + i for i in items)
        + ' } VALUES ?lang { "en" "vi" "zh" } ?i schema:description ?d FILTER(LANG(?d) = ?lang) } GROUP BY ?lang')}
    for l, L in LANG_NAME.items():
        S[f"lxDesc{L}"] = got.get(l, "0")
else:
    for k in ONLINE_KEYS:
        S[k] = old.get(k, "??")

# Output
S.update(MANUAL)
today = date.today()
S["lxStatsDate"] = f"{today.day} {today:%B %Y}"
OUT.parent.mkdir(parents=True, exist_ok=True)
lines = ["% Generated by scripts/report_stats.py. Do not edit; run the script again.",
         f"% Build: {BUILD.name}; Wikidata counts {'refreshed' if ONLINE else 'kept from the previous run'}."]
for k in sorted(S):
    lines.append(f"\\newcommand{{\\{k}}}{{{S[k]}}}")
OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"wrote {OUT.relative_to(ROOT)}: {len(S)} macros")
for k in ("lxConcepts", "lxEntries", "lxSenses", "lxTriples", "lxConceptsLinked", "lxLexemeAll", "lxExamplesEn", "lxExamplesZh"):
    print(f"  {k} = {S[k]}")