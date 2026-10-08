#!/usr/bin/env python3
"""
Turn the picked concept candidates (LexNet-candidates spreadsheet, chon = x) into rows to paste
into the concepts, en, vi and zh tabs of the team spreadsheet.

    python3 scripts/candidates_to_rows.py LexNet-candidates.xlsx

Synonyms: the en, vi and zh cells may hold several words separated by ";". The first one becomes
the concept label (pref_label = x) and each word gets its own row, e.g. vi = "ăn; xơi", zh = "吃; 食".

Output: build/new-rows/concepts.tsv, en.tsv, vi.tsv, zh.tsv, without a header row. Copy a file's
content and paste it into column A of the first empty row of the tab with the same name.

Levels and pinyin are looked up again in ref/ (the official lists) instead of trusting the candidates
file; English IPA comes from ref/cmudict-ipa.tsv via en_ipa.py. Standard library only.
"""
import csv, os, re, sys, unicodedata
from collections import Counter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_sheet import read_xlsx
import en_ipa

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *x: os.path.join(ROOT, *x)
SHORT = {"noun": "noun", "verb": "verb", "adjective": "adj", "numeral": "num"}
# same column order as the spreadsheet tabs
COLS = {
    "concepts": ["concept_id", "topic", "pos", "gloss_en", "hypernym", "meronym", "antonym", "wikidata", "close_match", "qid_ok", "note"],
    "en": ["concept_id", "word", "pref_label", "ipa", "level", "register", "example", "wikidata_lexeme", "ok", "note"],
    "vi": ["concept_id", "word", "pref_label", "register", "wikidata_lexeme", "ok", "note"],
    "zh": ["concept_id", "word", "pref_label", "pinyin", "level", "register", "example", "wikidata_lexeme", "ok", "note"],
}
nfc = lambda s: unicodedata.normalize("NFC", (s or "").strip())
notes = []


def load_refs():
    ox, hsk = {}, {}
    if os.path.exists(P("ref", "oxford-cefr.tsv")):
        with open(P("ref", "oxford-cefr.tsv"), encoding="utf-8") as f:
            for r in csv.DictReader(f, delimiter="\t"):
                ox.setdefault((r["word"], r["pos"]), []).append((r["sense"], r["level"]))
    if os.path.exists(P("ref", "hsk-2025.tsv")):
        with open(P("ref", "hsk-2025.tsv"), encoding="utf-8") as f:
            for r in csv.DictReader(f, delimiter="\t"):
                hsk.setdefault(r["word"], []).append((r["level"], nfc(r["pinyin"]), r["pos"]))
    return ox, hsk


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    tab = read_xlsx(sys.argv[1]).get("candidates")
    if tab is None:
        sys.exit("No 'candidates' tab. Is this the candidates file?")
    picked = [r for r in tab if r.get("chon", "").lower() == "x" and r.get("en")]
    for r in [r for r in picked if r.get("da_co")]:
        notes.append(f"'{r['en']}' is already in LexNet ({r['da_co']}); skipped")
    picked = [r for r in picked if not r.get("da_co")]
    if not picked:
        sys.exit("No new rows with chon = x." + ("\n" + "\n".join(notes) if notes else ""))
    ox, hsk = load_refs()
    ipa_ref = en_ipa.load_ref()
    with open(P("data", "lexnet-concepts.csv"), encoding="utf-8-sig") as f:
        existing = {r["concept_id"]: r for r in csv.DictReader(f)}
    split = lambda v: [w for w in (nfc(x) for x in re.split(r"[;；]", v or "")) if w]   # "ăn; xơi" -> ["ăn", "xơi"]
    slug = lambda w: re.sub(r"[^a-z0-9]+", "_", w.lower()).strip("_")
    lemma_pos = {}                                     # lemma -> POS in use
    for cid, c in existing.items():
        lemma_pos.setdefault(re.sub(r"_(noun|verb|adj|num)$", "", cid), set()).add(c["pos"])
    for r in picked:
        lemma_pos.setdefault(slug(split(r["en"])[0]), set()).add(r.get("pos") or "noun")
    used, out = set(existing), {k: [] for k in COLS}
    per_lemma = Counter(slug(split(r["en"])[0]) for r in picked)

    def en_level(word, pos):
        refs = ox.get((word.lower(), pos), [])
        if refs and any(s_ for s_, _ in refs):
            notes.append(f"'{word}': Oxford levels differ by sense ({', '.join(f'{s_} {l}' for s_, l in refs)}); pick the right one")
            return ""
        return min((l for _, l in refs), default="")

    def zh_info(word, pos, cid):
        if word not in hsk:
            notes.append(f"{cid}: '{word}' is not in the HSK syllabus; no level, pinyin to fill in")
            return "", ""
        zpos = {"noun": "名", "verb": "动", "adjective": "形", "numeral": "数"}[pos]
        match = [x for x in hsk[word] if zpos in x[2]] or hsk[word]
        best = sorted(match, key=lambda x: (len(x[0]), x[0]))[0]
        return best[0], best[1]

    for r in picked:
        ens, vis, zhs = split(r["en"]), split(r.get("vi")), split(r.get("zh"))
        pos, topic = r.get("pos") or "noun", r.get("topic", "")
        lemma = slug(ens[0])
        cid = lemma
        if len(lemma_pos.get(lemma, ())) > 1:          # same lemma, different POS -> _noun / _verb / _adj / _num
            cid = f"{lemma}_{SHORT[pos]}"
            if lemma in existing:
                notes.append(f"'{lemma}' is already in the sheet ({existing[lemma]['pos']}); rename it to "
                             f"{lemma}_{SHORT[existing[lemma]['pos']]} (in the en/vi/zh tabs too)")
        if cid in used:
            base, n = cid, 2
            while f"{base}_{n}" in used:
                n += 1
            cid = f"{base}_{n}"
            notes.append(f"'{base}' is taken; using '{cid}' for now, give it a meaningful name (e.g. believe_think / believe_trust)")
        elif per_lemma[lemma] > 1 and len(lemma_pos.get(lemma, ())) == 1:
            notes.append(f"'{ens[0]}' picked {per_lemma[lemma]} times (different senses); use distinct ids and fill gloss_en")
        used.add(cid)

        out["concepts"].append({"concept_id": cid, "topic": topic, "pos": pos})
        # first word = concept label (pref_label = x); the rest are synonyms, one row each
        for k, w in enumerate(ens):
            ipa, ipa_note = en_ipa.pick(w, pos, ipa_ref)
            if not ipa and ipa_ref:
                ipa_note = "not in CMUdict; IPA to fill in"
            if ipa_note:
                notes.append(f"'{w}' IPA: {ipa_note}")
            out["en"].append({"concept_id": cid, "word": w, "pref_label": "x" if k == 0 else "", "ipa": ipa,
                              "level": en_level(w, pos)})
        for k, w in enumerate(vis or [""]):
            out["vi"].append({"concept_id": cid, "word": w, "pref_label": "x" if k == 0 else ""})
        if not vis:
            notes.append(f"{cid}: no Vietnamese word (vi column); the cell will show red in the vi tab")
        if not zhs:
            notes.append(f"{cid}: no Chinese word yet")
        for k, w in enumerate(zhs or [""]):
            lvl, py = zh_info(w, pos, cid) if w else ("", "")
            out["zh"].append({"concept_id": cid, "word": w, "pref_label": "x" if k == 0 else "", "pinyin": py, "level": lvl})
        if len(vis) > 1 or len(zhs) > 1 or len(ens) > 1:
            notes.append(f"{cid}: has synonyms; set the register of the extra words (e.g. xơi: polite, 食: literary)")

    os.makedirs(P("build", "new-rows"), exist_ok=True)
    for tab_name, rows in out.items():
        with open(P("build", "new-rows", f"{tab_name}.tsv"), "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=COLS[tab_name], delimiter="\t", extrasaction="ignore", lineterminator="\n")
            w.writerows(rows)
    print(f"{len(picked)} concepts, {len(out['en'])} en rows, {len(out['vi'])} vi rows, {len(out['zh'])} zh rows "
          "→ build/new-rows/concepts.tsv, en.tsv, vi.tsv, zh.tsv")
    print("Paste: open the .tsv, select all, copy; in the tab with the same name click column A of the first empty row and paste.")
    print("Then fill in hypernym and antonym for the new concepts and review the rows as usual.")
    if notes:
        print(f"\n{len(notes)} NOTES:")
        for n in notes:
            print("  -", n)


if __name__ == "__main__":
    main()
