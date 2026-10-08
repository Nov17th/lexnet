#!/usr/bin/env python3
"""
Suggest Wikidata links for human review. The data in data/ is not changed.

    python3 scripts/lookup_wikidata.py      (needs internet, 1-3 minutes)

Writes to build/:
  wikidata-suggestions.csv          one row per concept and per word:
                                      concepts: current QID vs the items linked (P5137) from the senses
                                      of the English lexeme, with their glosses; status OK / DIFFERENT / MISSING
                                      words: Wikidata lexemes with the same language, lemma and POS
  lexnet-entries-with-lexemes.csv   copy of the entries with wikidata_lexeme filled in where the cell
                                      was empty and exactly one lexeme matched (note "lexeme auto")
  lexnet-concepts-with-qids.csv     copy of the concepts with the QID filled in where the cell was empty
                                      and there was exactly one candidate (note "qid auto")
Review these before copying anything back to the spreadsheet.
"""
import csv, json, os, time, urllib.error, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *parts: os.path.join(ROOT, *parts)

UA = {"User-Agent": "LexNet-student-project/1.0 (semantic web course)"}
LANG_ITEM = {"en": "Q1860", "vi": "Q9199", "zh": "Q727694"}      # English, Vietnamese, Standard Chinese
POS_ITEM = {"noun": "Q1084", "verb": "Q24905", "adjective": "Q34698", "numeral": "Q63116"}
# Wikidata tags some English cardinals (one, two...) as determiners (Q576271), so accept both
CATS = {pos: [q] for pos, q in POS_ITEM.items()}
CATS["numeral"].append("Q576271")
cat_values = lambda pos: " ".join("wd:" + q for q in CATS[pos])

def get_json(url, timeout=90):
    for attempt in range(4):                       # retry when rate limited (HTTP 429)
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout))
        except urllib.error.HTTPError as ex:
            if ex.code != 429 or attempt == 3:
                raise
            time.sleep(5 * (attempt + 1))

def wdqs(query):
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": query, "format": "json"})
    return get_json(url)["results"]["bindings"]

def read_csv(path):
    with open(path, encoding="utf-8-sig") as f:
        return [{k: (v or "").strip() for k, v in r.items()} for r in csv.DictReader(f)]

def add_note(row, text):
    row["note"] = (row.get("note", "") + "; " if row.get("note") else "") + text

concepts = read_csv(P("data", "lexnet-concepts.csv"))
entries = read_csv(P("data", "lexnet-entries.csv"))
pos_of = {c["concept_id"]: c["pos"] for c in concepts}
first_en = {}                                      # concept -> English label word (pref_label = x)
for e in entries:
    if e["lang"] == "en":
        if e.get("pref_label", "").lower() == "x":
            first_en[e["concept_id"]] = e["word"]
        else:
            first_en.setdefault(e["concept_id"], e["word"])

rows = []

# Concepts: candidate QIDs from the senses of the English lexeme (P5137 "item for this sense")
sense_cands = {}    # (word, pos) -> [(qid, label, gloss)]
by_pos = {}
for c in concepts:
    if c["concept_id"] in first_en and c["pos"] in POS_ITEM:
        by_pos.setdefault(c["pos"], set()).add(first_en[c["concept_id"]])
for pos, words in by_pos.items():
    words = sorted(words)
    for i in range(0, len(words), 40):
        values = " ".join(json.dumps(w) for w in words[i:i + 40])
        q = f"""PREFIX dct: <http://purl.org/dc/terms/>
PREFIX ontolex: <http://www.w3.org/ns/lemon/ontolex#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?w ?item ?itemLabel ?gloss WHERE {{
  VALUES ?w {{ {values} }}
  VALUES ?cat {{ {cat_values(pos)} }}
  ?lex dct:language wd:Q1860 ; wikibase:lexicalCategory ?cat ;
       wikibase:lemma ?lemma ; ontolex:sense ?s .
  FILTER(STR(?lemma) = ?w)
  ?s wdt:P5137 ?item .
  OPTIONAL {{ ?s skos:definition ?gloss . FILTER(LANG(?gloss) = "en") }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}}"""
        try:
            for b in wdqs(q):
                lst = sense_cands.setdefault((b["w"]["value"], pos), [])
                cand = (b["item"]["value"].rsplit("/", 1)[-1], b["itemLabel"]["value"], b.get("gloss", {}).get("value", ""))
                if cand[0] not in [x[0] for x in lst]:
                    lst.append(cand)
        except Exception as ex:
            print("sense lookup failed", pos, ex)
        time.sleep(1)

# A polysemous English word gives the same candidates for each of its concepts,
# so those are never filled in automatically; the reviewer picks by gloss_en.
from collections import Counter
shared_word = Counter((first_en.get(c["concept_id"], ""), c["pos"]) for c in concepts)

qid_fill = {}
for c in concepts:
    cid, cur, word = c["concept_id"], c["wikidata"], first_en.get(c["concept_id"], "")
    if not word:
        continue
    cands = sense_cands.get((word, c["pos"]), [])
    ids = [x[0] for x in cands]
    if cur:
        status = "OK" if cur in ids else ("DIFFERENT" if ids else "NO CANDIDATES")
    else:
        if shared_word[(word, c["pos"])] > 1:
            status = "MISSING (polysemous word, pick by gloss)" if ids else "MISSING"
        else:
            status = "MISSING (1 candidate)" if len(ids) == 1 else "MISSING (several candidates)" if ids else "MISSING"
            if len(ids) == 1:
                qid_fill[cid] = ids[0]
    row = {"kind": "concept", "key": cid, "word": word, "gloss_en": c["gloss_en"], "current": cur, "status": status,
           "cand1": " || ".join(f"{q} | {lab} | {g}" for q, lab, g in cands[:6])}
    rows.append(row)

# Words: lexemes with the same language, lemma and POS (batched per language and POS)
found = {}   # (lang, word, pos) -> [L-ids]
groups = {}
for e in entries:
    pos = pos_of.get(e["concept_id"])
    if pos in POS_ITEM and e["lang"] in LANG_ITEM:
        groups.setdefault((e["lang"], pos), set()).add(e["word"])
for (lang, pos), words in groups.items():
    words = sorted(words)
    for i in range(0, len(words), 40):
        values = " ".join(json.dumps(w, ensure_ascii=False) for w in words[i:i + 40])
        q = f"""PREFIX dct: <http://purl.org/dc/terms/>
SELECT ?w ?lex WHERE {{
  VALUES ?w {{ {values} }}
  VALUES ?cat {{ {cat_values(pos)} }}
  ?lex dct:language wd:{LANG_ITEM[lang]} ; wikibase:lexicalCategory ?cat ; wikibase:lemma ?lemma .
  FILTER(STR(?lemma) = ?w)
}}"""
        try:
            for b in wdqs(q):
                found.setdefault((lang, b["w"]["value"], pos), []).append(b["lex"]["value"].rsplit("/", 1)[-1])
        except Exception as ex:
            print("lexeme lookup failed", lang, pos, ex)
        time.sleep(1)

seen = set()
for e in entries:
    pos = pos_of.get(e["concept_id"], "")
    key = (e["lang"], e["word"], pos)
    if key in seen:
        continue
    seen.add(key)
    lex = sorted(set(found.get(key, [])))
    cur = e["wikidata_lexeme"]
    status = ("OK" if cur and cur in lex else "DIFFERENT" if cur else
              "MISSING (1 candidate)" if len(lex) == 1 else "MISSING (several candidates)" if lex else "NOT FOUND")
    rows.append({"kind": "entry", "key": f"{e['lang']}:{e['word']}:{pos}", "word": e["word"],
                 "current": cur, "status": status, "cand1": " ; ".join(lex)})

fields = ["kind", "key", "word", "gloss_en", "current", "status", "cand1"]
with open(P("build", "wikidata-suggestions.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=fields); w.writeheader()
    for r in rows:
        w.writerow({k: r.get(k, "") for k in fields})

# Pre-filled copies: only empty cells with exactly one candidate
filled = 0
for e in entries:
    key = (e["lang"], e["word"], pos_of.get(e["concept_id"], ""))
    lex = sorted(set(found.get(key, [])))
    if not e["wikidata_lexeme"] and len(lex) == 1:
        e["wikidata_lexeme"] = lex[0]
        add_note(e, "lexeme auto, verify")
        filled += 1
with open(P("build", "lexnet-entries-with-lexemes.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(dict.fromkeys(list(entries[0]) + ["note"]))); w.writeheader(); w.writerows(entries)

for c in concepts:
    if c["concept_id"] in qid_fill:
        c["wikidata"] = qid_fill[c["concept_id"]]
        add_note(c, "qid auto, verify")
with open(P("build", "lexnet-concepts-with-qids.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(dict.fromkeys(list(concepts[0]) + ["note"]))); w.writeheader(); w.writerows(concepts)

n_c = sum(1 for r in rows if r["kind"] == "concept")
print(f"Concepts: {n_c} looked up; " + ", ".join(f"{k}: {v}" for k, v in
      Counter(r["status"] for r in rows if r["kind"] == "concept").items()) + f"; {len(qid_fill)} QIDs pre-filled")
print(f"Words: {len(seen)}; {filled} lexemes pre-filled in lexnet-entries-with-lexemes.csv")
print("Review build/wikidata-suggestions.csv before use.")
