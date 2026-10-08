#!/usr/bin/env python3
"""
Copy the team spreadsheet (downloaded as .xlsx) into data/*.csv.

    python3 scripts/import_sheet.py LexNet-data.xlsx
    python3 scripts/csv_to_ttl.py

Only the data columns are copied. Helper columns, review marks (ok, qid_ok), notes
and the working tabs (README, cot, ref, lists) stay in the spreadsheet.
  topics       -> data/lexnet-topics.csv
  concepts     -> data/lexnet-concepts.csv
  en, vi, zh   -> data/lexnet-entries.csv   (merged, with a lang column)
  confusables  -> data/lexnet-confusables.csv
Standard library only.
"""
import csv, os, re, sys, unicodedata, zipfile
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
      "rel": "http://schemas.openxmlformats.org/package/2006/relationships"}

SIMPLE = {   # tab -> (file, columns, key column; rows with an empty key are dropped)
    "topics": ("lexnet-topics.csv", ["topic_id", "label_en", "label_vi", "label_zh", "include"], "topic_id"),
    "concepts": ("lexnet-concepts.csv", ["concept_id", "topic", "pos", "gloss_en", "hypernym", "meronym", "antonym",
                                         "wikidata", "close_match"], "concept_id"),
    "confusables": ("lexnet-confusables.csv", ["lang", "word1", "word2", "type"], "word1"),
}
ENTRY_TABS = ("en", "vi", "zh")
ENTRY_COLS = ["concept_id", "lang", "word", "pref_label", "pinyin", "ipa", "level", "register", "example", "wikidata_lexeme"]


def col_index(ref):
    """'C12' -> 2"""
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group():
        n = n * 26 + ord(ch) - 64
    return n - 1


def clean(v):
    v = unicodedata.normalize("NFC", (v or "").strip())
    if re.fullmatch(r"-?\d+\.0", v):            # spreadsheets store 3 as 3.0
        v = v[:-2]
    return v


def read_xlsx(path):
    """-> {tab name: [row dicts keyed by the header row]}"""
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels")).findall("rel:Relationship", NS)}
    tabs = {}
    for sh in ET.fromstring(z.read("xl/workbook.xml")).find("m:sheets", NS):
        target = rels[sh.get(f"{{{NS['r']}}}id")].lstrip("/")
        target = target if target.startswith("xl/") else "xl/" + target
        rows = []
        for row in ET.fromstring(z.read(target)).iter(f"{{{NS['m']}}}row"):
            vals = {}
            for c in row.findall("m:c", NS):
                t, v = c.get("t"), c.find("m:v", NS)
                if t == "s":
                    val = shared[int(v.text)] if v is not None else ""
                elif t == "inlineStr":
                    val = "".join(x.text or "" for x in c.iter(f"{{{NS['m']}}}t"))
                elif t == "b":
                    val = "TRUE" if v is not None and v.text == "1" else "FALSE"
                else:
                    val = v.text if v is not None else ""
                vals[col_index(c.get("r"))] = val
            rows.append(vals)
        if not rows:
            tabs[sh.get("name")] = []
            continue
        header = [clean(rows[0].get(i, "")) for i in range(max(rows[0]) + 1)] if rows[0] else []
        tabs[sh.get("name")] = [{h: clean(r.get(i, "")) for i, h in enumerate(header) if h} for r in rows[1:]]
    return tabs


def write(name, cols, rows):
    path = os.path.join(ROOT, "data", name)
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore", lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    print(f"  data/{name}: {len(rows)} rows")


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    tabs = read_xlsx(sys.argv[1])
    missing = [t for t in list(SIMPLE) + list(ENTRY_TABS) if t not in tabs]
    if missing:
        sys.exit(f"Missing tabs: {', '.join(missing)}. Is this the LexNet spreadsheet?")
    print("Copied:")
    for tab, (name, cols, key) in SIMPLE.items():
        write(name, cols, [r for r in tabs[tab] if r.get(key)])
    entries = []
    for lang in ENTRY_TABS:
        for r in tabs[lang]:
            if r.get("concept_id") or r.get("word"):
                entries.append(dict(r, lang=lang))
    write("lexnet-entries.csv", ENTRY_COLS, entries)
    print("Next: python3 scripts/csv_to_ttl.py")


if __name__ == "__main__":
    main()
