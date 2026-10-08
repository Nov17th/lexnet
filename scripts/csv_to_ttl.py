#!/usr/bin/env python3
"""
Build build/lexnet-full.ttl from the ontology and the CSV data, and print warnings for review.

    python3 scripts/csv_to_ttl.py

Input
  ontology/lexnet-ontology.ttl  copied to the top of the output
  data/lexnet-topics.csv        topics; include = no switches a topic off
  data/lexnet-concepts.csv      one row per concept
  data/lexnet-entries.csv       one row per sense, i.e. one word used for one concept
                                  several words for one concept and language -> synonyms (吃/食)
                                  one word (language, spelling, POS) for several concepts -> polysemy
                                  pref_label = x marks the word used as the concept label (else the first row)
                                  pinyin (zh) and ipa (en) go on the form as ontolex:phoneticRep
                                  level, register and example belong to the sense
  data/lexnet-confusables.csv   hand-picked confusable pairs (glyph or meaning), English and Chinese;
                                  a Chinese glyph pair of single characters is linked at character level
  data/hanzi-unihan.tsv         radicals, strokes and readings from Unihan
  ref/*.tsv (optional)          Oxford, HSK and CMUdict lists, used to check levels, pinyin and IPA
Homophones (similarSound) are not read from the CSV; they are derived at the end of this script.
"""
import csv, os, re, unicodedata
from collections import OrderedDict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *parts: os.path.join(ROOT, *parts)
ONTOLOGY = P("ontology", "lexnet-ontology.ttl")
TOPICS, CONCEPTS = P("data", "lexnet-topics.csv"), P("data", "lexnet-concepts.csv")
ENTRIES, CONFUSABLES = P("data", "lexnet-entries.csv"), P("data", "lexnet-confusables.csv")
HANZI, OUT = P("data", "hanzi-unihan.tsv"), P("build", "lexnet-full.ttl")
REF_OXFORD, REF_HSK = P("ref", "oxford-cefr.tsv"), P("ref", "hsk-2025.tsv")   # local copies, optional
REF_IPA = P("ref", "cmudict-ipa.tsv")

SITE = "https://nov17th.github.io/lexnet/"   # GitHub Pages address of the repository
BASE = SITE + "build/lexnet-full.ttl#"     # hash IRIs: looking one up returns this file
LANGS = ("en", "vi", "zh")
POS = {"noun": "noun", "verb": "verb", "adjective": "adj", "numeral": "num"}
REGISTERS = {"formal", "literary", "informal", "polite"}
CONF_TYPES = {"glyph": "lexnet:similarGlyph", "meaning": "lexnet:similarMeaning"}   # sound is derived, not imported
CEFR = ("A1", "A2", "B1", "B2", "C1", "C2")
HSK = ("1", "2", "3", "4", "5", "6", "7-9")
RADICAL_VARIANT = {"9": "亻", "18": "刂", "61": "忄", "64": "扌", "85": "氵", "86": "灬", "94": "犭",
                   "96": "王", "113": "礻", "118": "⺮", "130": "月", "140": "艹", "145": "衤",
                   "162": "辶", "163": "阝", "170": "阝"}

warnings = []
def warn(msg): warnings.append(msg)

def read_csv(path):
    with open(path, encoding="utf-8-sig") as f:                # utf-8-sig: tolerate Excel's BOM
        return [{k: (v or "").strip() for k, v in r.items()} for r in csv.DictReader(f)]

def lit(s, lang=None):
    s = s.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{s}"@{lang}' if lang else f'"{s}"'

def nfc(s): return unicodedata.normalize("NFC", s)
def slug(word): return re.sub(r"[^\w\-]+", "_", nfc(word)).strip("_")
def iri(kind, local): return f"<{BASE}{kind}/{local}>"

TONE_MARKS = {"̀", "́", "̄", "̌"}            # keeps the umlaut of ü
def pinyin_key(p): return re.sub(r"[\s'’]", "", nfc(p).lower())
def ipa_key(p): return re.sub(r"[\s/]", "", nfc(p))
def toneless(p):
    d = unicodedata.normalize("NFD", pinyin_key(p))
    return nfc("".join(c for c in d if c not in TONE_MARKS))

hanzi = {}
with open(HANZI, encoding="utf-8") as f:
    for r in csv.DictReader(f, delimiter="\t"):
        r["readings"] = [nfc(x) for x in r["readings"].split("/") if x]
        hanzi[r["char"]] = r

topics = OrderedDict((t["topic_id"], t) for t in read_csv(TOPICS) if t["topic_id"])
active_topics = {k for k, t in topics.items() if t.get("include", "yes").lower() != "no"}
for tid in active_topics:
    for l in ("en", "vi"):                                     # label_zh is optional
        if not topics[tid].get(f"label_{l}"):
            warn(f"topic '{tid}': missing label_{l}")

concepts, skipped = OrderedDict(), set()
for c in read_csv(CONCEPTS):
    cid = c["concept_id"]
    if not cid:
        continue
    if not re.fullmatch(r"[a-z0-9]+(_[a-z0-9]+)*", cid):
        warn(f"concept_id '{cid}': bad format (lowercase ASCII, digits, joined by _)")
    if cid in concepts:
        warn(f"concept_id '{cid}' is duplicated; later row dropped"); continue
    if c["topic"] not in topics:
        warn(f"{cid}: topic '{c['topic']}' is not in the topics tab")
    elif c["topic"] not in active_topics:
        skipped.add(cid); continue
    if c["pos"] not in POS:
        warn(f"{cid}: invalid pos '{c['pos']}' (noun/verb/adjective/numeral); treated as noun"); c["pos"] = "noun"
    concepts[cid] = c

def level_iri(lang, value):
    if lang == "en" and value in CEFR:
        return f"level:CEFR_{value}"
    if lang == "zh" and value in HSK:
        return f"level:HSK_{value}"
    return None

entries = OrderedDict()            # (lang, word, pos) -> entry
label_word = {}                    # (concept, lang) -> word used as the concept label
words_of, prefs = {}, {}           # (concept, lang) -> all words / words marked pref_label = x
for r in read_csv(ENTRIES):
    cid, lang, word = r["concept_id"], r["lang"], nfc(r["word"])
    if not cid or not word or cid in skipped:
        continue
    if cid not in concepts:
        warn(f"entries: '{word}' points to unknown concept_id '{cid}'"); continue
    if lang not in LANGS:
        warn(f"entries: '{word}' has invalid lang '{lang}' (en/vi/zh)"); continue
    pos = concepts[cid]["pos"]
    e = entries.setdefault((lang, word, pos), dict(lang=lang, word=word, pos=pos, pinyin="", ipa="",
                                                   lexeme="", senses=[]))
    words_of.setdefault((cid, lang), []).append(word)
    if r.get("pref_label", "").strip().lower() in ("x", "yes", "true", "1"):
        prefs.setdefault((cid, lang), []).append(word)
    if lang != "zh" and r.get("pinyin"):
        warn(f"'{word}' ({lang}): pinyin is for Chinese only; ignored")
    if lang != "en" and r.get("ipa"):
        warn(f"'{word}' ({lang}): ipa is for English only; ignored")
    vals = (("pinyin", nfc(r["pinyin"]) if lang == "zh" else ""), ("ipa", nfc(r.get("ipa", "")).strip("/") if lang == "en" else ""),
            ("lexeme", r["wikidata_lexeme"]))
    for field, val in vals:
        if val and e[field] and e[field] != val:
            warn(f"'{word}' ({lang}): {field} differs between rows ('{e[field]}' vs '{val}'); first value kept")
        elif val:
            e[field] = val
    if r["register"] and r["register"] not in REGISTERS:
        warn(f"'{word}': invalid register '{r['register']}' ({'/'.join(sorted(REGISTERS))})")
    if any(s["concept"] == cid for s in e["senses"]):
        warn(f"'{word}' ({lang}) repeated for concept '{cid}'; later row dropped"); continue
    lvl = r["level"].replace("–", "-")
    if lvl and lang == "vi":
        warn(f"'{word}' (vi): Vietnamese is the reference language; level ignored"); lvl = ""
    elif lvl and not level_iri(lang, lvl):
        warn(f"'{word}' ({lang}, sense '{cid}'): invalid level '{lvl}' "
             f"({'/'.join(CEFR) if lang == 'en' else '/'.join(HSK)})"); lvl = ""
    e["senses"].append(dict(concept=cid, register=r["register"] if r["register"] in REGISTERS else "",
                            example=r["example"], level=lvl))

for key, ws in words_of.items():   # label: the row marked pref_label, else the first row
    m = prefs.get(key, [])
    if len(m) > 1:
        warn(f"{key[0]} ({key[1]}): {len(m)} words marked pref_label ({', '.join(m)}); SKOS allows one label per language, keeping '{m[0]}'")
    elif not m and len(ws) > 1:
        warn(f"{key[0]} ({key[1]}): no pref_label marked; using '{ws[0]}'")
    label_word[key] = m[0] if m else ws[0]

# Checks that only warn
def align(word, pinyin):
    """Match a word's pinyin to its characters. Returns [(char, syllable, status)] or None."""
    p, chars = pinyin_key(pinyin), list(word)
    best = [None, 99]
    def rec(i, pos, acc):
        if i == len(chars):
            if pos == len(p):
                bad = sum(1 for x in acc if x[2] == "tone")
                if bad < best[1]:
                    best[0], best[1] = list(acc), bad
            return
        readings = list(hanzi[chars[i]]["readings"])
        if chars[i] == "儿" and i == len(chars) - 1 and i > 0:
            readings.append("r")                       # erhua: 男孩儿 nánháir
        for r in readings:
            t = toneless(r)
            seg = p[pos:pos + len(t)]
            if toneless(seg) != t:
                continue
            status = "ok" if seg == pinyin_key(r) else ("neutral" if seg == t else "tone")
            rec(i + 1, pos + len(t), acc + [(chars[i], seg, status)])
    rec(0, 0, [])
    return best[0]

for cid in concepts:
    for lang in LANGS:
        if (cid, lang) not in label_word:
            warn(f"{cid}: no {lang} word yet")
seen_lexeme = {}
for (lang, word, pos), e in entries.items():
    if lang in ("en", "zh") and not any(s["level"] for s in e["senses"]) and not os.path.exists(REF_OXFORD):
        warn(f"'{word}' ({lang}): no {'CEFR' if lang == 'en' else 'HSK'} level on any sense")
    if e["lexeme"]:
        if e["lexeme"] in seen_lexeme:
            warn(f"lexeme {e['lexeme']} used for both '{seen_lexeme[e['lexeme']]}' and '{word}'; check")
        seen_lexeme.setdefault(e["lexeme"], word)
    if lang == "zh":
        known = all(ch in hanzi for ch in word)
        if not e["pinyin"]:
            sug = "".join(hanzi[ch]["common_reading"] for ch in word if ch in hanzi)
            warn(f"'{word}': no pinyin (Unihan suggests {sug}; check characters with several readings)")
        elif known:
            res = align(word, e["pinyin"])
            if res is None:
                opts = " ".join(f"{ch}[{'/'.join(hanzi[ch]['readings'])}]" for ch in word)
                warn(f"'{word}': pinyin '{e['pinyin']}' matches no reading of its characters: {opts}")
            else:
                for i, (ch, seg, status) in enumerate(res):
                    if status == "neutral" and i == 0:
                        warn(f"'{word}': first syllable '{seg}' has no tone mark; missing? "
                             f"(readings: {'/'.join(hanzi[ch]['readings'])})")
                    elif status == "tone":
                        warn(f"'{word}': syllable '{seg}' of {ch} has the wrong tone (readings: {'/'.join(hanzi[ch]['readings'])})")
# Official lists (only if ref/ exists): a word's lowest level must match the list, and words not on
# the list get no level. Words Oxford levels per sense (bank: A1 / B1) are checked by hand.
outside = set()
if os.path.exists(REF_OXFORD) and os.path.exists(REF_HSK):
    ox, hsk = {}, {}
    with open(REF_OXFORD, encoding="utf-8") as f:
        for r in csv.DictReader(f, delimiter="\t"):
            ox.setdefault((r["word"], r["pos"]), []).append((r["sense"], r["level"]))
    with open(REF_HSK, encoding="utf-8") as f:
        for r in csv.DictReader(f, delimiter="\t"):
            hsk.setdefault(r["word"], []).append((r["level"], nfc(r["pinyin"]), r["pos"]))
    ZPOS, RANK = {"noun": "名", "verb": "动", "adjective": "形", "numeral": "数"}, {l: i for i, l in enumerate(CEFR + HSK)}
    for (lang, word, pos), e in entries.items():
        if lang not in ("en", "zh"):
            continue
        have = sorted((s["level"] for s in e["senses"] if s["level"]), key=RANK.get)
        if lang == "en":
            refs = ox.get((word.lower(), pos), [])
            if any(sense for sense, _ in refs):
                continue
            official = sorted({lv for _, lv in refs}, key=RANK.get)[0] if refs else ""
        else:
            refs = hsk.get(word, [])
            match = [x for x in refs if ZPOS[pos] in x[2]] or refs
            official = sorted({x[0] for x in match}, key=lambda l: (len(l), l))[0] if match else ""
            pys = {pinyin_key(x[1]) for x in refs}
            if e["pinyin"] and pys and pinyin_key(e["pinyin"]) not in pys:
                warn(f"'{word}': pinyin '{e['pinyin']}' differs from the HSK syllabus ({' / '.join(sorted({x[1] for x in refs}))})")
        src = "Oxford 3000/5000" if lang == "en" else "HSK 3.0 (2025)"
        if not refs:
            outside.add((lang, word))
            if have:
                warn(f"'{word}' ({lang}): has level {have[0]} but is not in {src}; leave empty")
        elif not have:
            warn(f"'{word}' ({lang}): {src} gives {official}; put it on the basic sense")
        elif have[0] != official:
            warn(f"'{word}' ({lang}): level {have[0]} differs from {src} ({official})")
# English IPA must match one of the CMUdict pronunciations (ref/cmudict-ipa.tsv)
if os.path.exists(REF_IPA):
    cmu = {}
    with open(REF_IPA, encoding="utf-8") as f:
        for r in csv.DictReader(f, delimiter="\t"):
            cmu[r["word"]] = [nfc(x.strip()) for x in r["ipa"].split("|") if x.strip()]
    for (lang, word, pos), e in entries.items():
        if lang != "en":
            continue
        alts = cmu.get(word.lower(), [])
        if not e["ipa"]:
            warn(f"'{word}': no IPA" + (f" (CMUdict: {' / '.join(alts)})" if alts else ""))
        elif alts and ipa_key(e["ipa"]) not in {ipa_key(a) for a in alts}:
            warn(f"'{word}': IPA '{e['ipa']}' differs from CMUdict ({' / '.join(alts)})")
seen_qid = {}
for cid, c in concepts.items():
    if c["wikidata"]:
        if c["wikidata"] in seen_qid:
            warn(f"QID {c['wikidata']} used for both '{seen_qid[c['wikidata']]}' and '{cid}'; check")
        seen_qid.setdefault(c["wikidata"], cid)

# Turtle output
out = [open(ONTOLOGY, encoding="utf-8").read().rstrip(), f"""
# Data, generated by scripts/csv_to_ttl.py from data/*.csv. Do not edit.
@prefix concept: <{BASE}concept/> .
@prefix topic:   <{BASE}topic/> .
@prefix radical: <{BASE}radical/> .
@prefix wd:      <http://www.wikidata.org/entity/> ."""]

for tid, t in topics.items():
    if tid in active_topics:
        labs = [lit(t[f"label_{l}"], l) for l in LANGS if t.get(f"label_{l}")]
        out.append(f"topic:{tid} a lexnet:ThematicDomain ;\n    skos:inScheme lexnet:Topics"
                   + (f" ;\n    skos:prefLabel {' , '.join(labs)}" if labs else "") + " .")

def concept_ref(target, field, src):
    if target in concepts:
        return f"concept:{target}"
    warn(f"{src}: {field} '{target}' " + ("is in a disabled topic; relation dropped" if target in skipped else "does not exist; dropped"))
    return None

def multi(v): return [x.strip() for x in v.split(";") if x.strip()]

for cid, c in concepts.items():
    L = [f"concept:{cid} a lexnet:Concept"]
    labs = [lit(label_word[(cid, l)], l) for l in LANGS if (cid, l) in label_word]
    if labs:
        L.append(f"skos:prefLabel {' , '.join(labs)}")
    if c["gloss_en"]:
        L.append(f"skos:definition {lit(c['gloss_en'], 'en')}")
    for field, prop in (("hypernym", "skos:broader"), ("meronym", "lexnet:partMeronym"), ("antonym", "lexnet:antonym")):
        for target in multi(c[field]):
            ref = concept_ref(target, field, cid)
            if ref:
                L.append(f"{prop} {ref}")
    if c["topic"] in active_topics:
        L.append(f"lexnet:inDomain topic:{c['topic']}")
    for q in multi(c["wikidata"]):
        L.append(f"skos:exactMatch wd:{q}")
    for q in multi(c.get("close_match", "")):
        L.append(f"skos:closeMatch wd:{q}")
    out.append(" ;\n    ".join(L) + " .")

chars_used, word_to_entries, used = OrderedDict(), {}, {}
for (lang, word, pos), e in entries.items():
    local = f"{lang}_{slug(word)}_{POS[pos]}"
    if local in used and used[local] != (lang, word, pos):
        local += f"_{len(used)}"
    used[local] = (lang, word, pos)
    E, F = iri("entry", local), iri("form", local)
    word_to_entries.setdefault((lang, word), []).append(E)

    L = [f"{E} a ontolex:LexicalEntry", f"lexinfo:partOfSpeech lexinfo:{pos}", f"ontolex:canonicalForm {F}"]
    for s in e["senses"]:
        L.append(f"ontolex:evokes concept:{s['concept']}")
    for s in e["senses"]:
        L.append(f"ontolex:sense {iri('sense', local + '_' + s['concept'])}")
    if e["lexeme"]:
        L.append(f"owl:sameAs wd:{e['lexeme']}")
    out.append(" ;\n    ".join(L) + " .")

    for s in e["senses"]:
        S = iri("sense", local + "_" + s["concept"])
        SL = [f"{S} a ontolex:LexicalSense", f"ontolex:isLexicalizedSenseOf concept:{s['concept']}"]
        if s["level"]:
            SL.append(f"lexnet:level {level_iri(lang, s['level'])}")
        if s["register"]:
            SL.append(f"lexnet:register lexnet:{s['register']}")
        if s["example"]:
            X = iri("example", local + "_" + s["concept"])
            SL.append(f"lexnet:hasExample {X}")
            out.append(f"{X} a lexnet:UsageExample ;\n    rdfs:label {lit(s['example'], lang)} .")
        out.append(" ;\n    ".join(SL) + " .")

    FL = [f"{F} a ontolex:Form", f"ontolex:writtenRep {lit(word, lang)}"]
    if lang == "en" and e["ipa"]:
        FL.append(f"ontolex:phoneticRep {lit(e['ipa'], 'en-US-fonipa')}")
    if lang == "zh":
        if e["pinyin"]:
            FL.append(f"ontolex:phoneticRep {lit(e['pinyin'], 'zh-Latn-pinyin')}")
        for ch in dict.fromkeys(word):
            if ch in hanzi:
                chars_used[ch] = hanzi[ch]
                FL.append(f"lexnet:hasCharacter {iri('char', ch)}")
    out.append(" ;\n    ".join(FL) + " .")

radicals = OrderedDict()
for ch, h in chars_used.items():
    rid = h["radical_num"].replace("'", "s")
    radicals[rid] = h
    L = [f"{iri('char', ch)} a lexnet:HanCharacter", f"rdfs:label {lit(ch, 'zh')}",
         f"lexnet:commonReading {lit(h['common_reading'])}"]
    L += [f"lexnet:reading {lit(x)}" for x in h["readings"]]
    L.append(f"lexnet:hasRadical radical:{rid}")
    if h["strokes"]:
        L.append(f'lexnet:strokeCount "{h["strokes"]}"^^xsd:integer')
    if h["definition"]:
        L.append(f"skos:definition {lit(h['definition'], 'en')}")
    out.append(" ;\n    ".join(L) + " .")
for rid, h in radicals.items():
    num, rch = h["radical_num"], h["radical_char"]
    L = [f"radical:{rid} a lexnet:Radical", f"rdfs:label {lit(rch, 'zh')}", f"lexnet:radicalNumber {lit(num)}"]
    if num in RADICAL_VARIANT:
        L.append(f"lexnet:variantForm {lit(RADICAL_VARIANT[num])}")
    if rch in hanzi and hanzi[rch]["definition"]:
        L.append(f"skos:definition {lit(hanzi[rch]['definition'], 'en')}")
    out.append(" ;\n    ".join(L) + " .")

n_conf, n_char = 0, 0
for r in read_csv(CONFUSABLES):
    lang, w1, w2, typ = r["lang"], nfc(r["word1"]), nfc(r["word2"]), r["type"]
    if not w1:
        continue
    if typ == "sound":
        warn(f"confusables: {w1}/{w2}: homophones are derived from pronunciations, not entered by hand; row dropped"); continue
    if typ not in CONF_TYPES:
        warn(f"confusables: {w1}/{w2} has invalid type '{typ}' (glyph/meaning)"); continue
    a, b = word_to_entries.get((lang, w1)), word_to_entries.get((lang, w2))
    # A Chinese glyph pair of single characters is linked at character level (similarCharacter).
    # The characters only need to occur in some word (白 only in 白色), so compounds are covered.
    # If both are also words on their own (买/卖), the words are linked too.
    if lang == "zh" and typ == "glyph" and len(w1) == 1 and len(w2) == 1:
        if w1 not in chars_used or w2 not in chars_used:
            miss = "、".join(c for c in (w1, w2) if c not in chars_used)
            warn(f"confusables: {w1}/{w2}: character {miss} is not in any Chinese word; skipped"); continue
        out.append(f"{iri('char', w1)} lexnet:similarCharacter {iri('char', w2)} ."); n_char += 1
        if not a or not b:
            continue
    elif not a or not b:
        warn(f"confusables: {w1}/{w2} ({lang}): word not in the en/zh tab; skipped"); continue
    for x in a:
        for y in b:
            out.append(f"{x} {CONF_TYPES[typ]} {y} ."); n_conf += 1

# Homophones (similarSound): two words of one language with different spelling and the same
# pronunciation (IPA for English, pinyin with tones for Chinese; 书 shū / 树 shù are not homophones).
# OWL 2 DL cannot compare literal values of two individuals, so the rule runs here.
by_sound = {}
for (lang, word, pos), e in entries.items():
    key = ipa_key(e["ipa"]) if lang == "en" else pinyin_key(e["pinyin"]) if lang == "zh" else ""
    if key:
        by_sound.setdefault((lang, key), set()).add(word)
n_sound, homophones = 0, []
for (lang, key), group in by_sound.items():
    ws = sorted(group)
    if len(ws) < 2:
        continue
    homophones.append(f"{' / '.join(ws)} ({key})")
    for i, w1 in enumerate(ws):
        for w2 in ws[i + 1:]:
            for x in word_to_entries[(lang, w1)]:
                for y in word_to_entries[(lang, w2)]:
                    out.append(f"{x} lexnet:similarSound {y} ."); n_sound += 1

# OWL has no unique name assumption, so concepts and radicals are declared different
out.append("[] a owl:AllDifferent ;\n    owl:distinctMembers ( " + " ".join(f"concept:{c}" for c in concepts) + " ) .")
if len(radicals) > 1:
    out.append("[] a owl:AllDifferent ;\n    owl:distinctMembers ( " + " ".join(f"radical:{r}" for r in radicals) + " ) .")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, "w", encoding="utf-8").write("\n\n".join(out) + "\n")
n_senses = sum(len(e["senses"]) for e in entries.values())
print(f"wrote build/lexnet-full.ttl: {len(concepts)} concepts, {len(entries)} words, {n_senses} senses, "
      f"{len(chars_used)} Han characters, {len(radicals)} radicals, {n_conf} hand-entered confusable pairs (glyph/meaning), "
      f"{n_char} look-alike character pairs, {n_sound} derived homophone pairs"
      + (f" ({len(skipped)} concepts in disabled topics)" if skipped else ""))
# Link coverage: concepts (needed for five stars) and words (optional, used for pronunciation)
n_linked = sum(1 for c in concepts.values() if c["wikidata"] or c.get("close_match"))
lex_cov = {l: (sum(1 for e in entries.values() if e["lang"] == l and e["lexeme"]),
               sum(1 for e in entries.values() if e["lang"] == l)) for l in LANGS}
print(f"Wikidata links: {n_linked}/{len(concepts)} concepts with a QID"
      + (f" ({len(concepts) - n_linked} missing, see build/wikidata-suggestions.csv)" if n_linked < len(concepts) else "")
      + " | words with a lexeme (optional): " + ", ".join(f"{l} {a}/{b}" for l, (a, b) in lex_cov.items()))
# Every English and Chinese sense needs an example. OWL cannot require it (open world), so count it here.
ex_cov = {l: (sum(1 for e in entries.values() if e["lang"] == l for s in e["senses"] if s["example"]),
              sum(len(e["senses"]) for e in entries.values() if e["lang"] == l)) for l in ("en", "zh")}
print("examples (required for en, zh): " + ", ".join(f"{l} {a}/{b} senses" for l, (a, b) in ex_cov.items()))
if outside:
    off = [cid for cid in concepts if all((l, label_word.get((cid, l))) in outside for l in ("en", "zh"))]
    print(f"not in Oxford/HSK: {len(outside)} words (correctly without a level)"
          + (f"; concepts with no target-language word on a list: {', '.join(off)} (keep only if needed for the is-a tree)" if off else ""))
if warnings:
    print(f"\n{len(warnings)} WARNINGS (to review):")
    for w in warnings:
        print("  -", w)
if homophones:
    print("homophones (derived similarSound): " + "; ".join(homophones))