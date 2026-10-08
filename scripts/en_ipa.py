#!/usr/bin/env python3
"""
English pronunciations (broad US IPA) from the CMU Pronouncing Dictionary.

candidates_to_rows.py imports pick() to pre-fill the ipa column. Run directly, it builds the local
table ref/cmudict-ipa.tsv for the words in ref/oxford-cefr.tsv and the English entries:

    curl -LO https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict
    python3 scripts/en_ipa.py cmudict.dict

Each word keeps every CMUdict pronunciation, in CMUdict order, separated by " | ".
Only primary stress is marked, and not on one-syllable words: /si/, /ˈwɔtɚ/.
CMUdict is BSD-2 licensed (Carnegie Mellon University). Standard library only.
"""
import csv, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, "ref", "cmudict-ipa.tsv")

VOWELS = {"AA": "ɑ", "AE": "æ", "AO": "ɔ", "AW": "aʊ", "AY": "aɪ", "EH": "ɛ", "EY": "eɪ",
          "IH": "ɪ", "IY": "i", "OW": "oʊ", "OY": "ɔɪ", "UH": "ʊ", "UW": "u"}
STRESS_DEP = {"AH": ("ə", "ʌ"), "ER": ("ɚ", "ɝ")}           # (unstressed, stressed)
CONS = {"B": "b", "CH": "tʃ", "D": "d", "DH": "ð", "F": "f", "G": "ɡ", "HH": "h", "JH": "dʒ", "K": "k",
        "L": "l", "M": "m", "N": "n", "NG": "ŋ", "P": "p", "R": "r", "S": "s", "SH": "ʃ", "T": "t",
        "TH": "θ", "V": "v", "W": "w", "Y": "j", "Z": "z", "ZH": "ʒ"}
# English syllable onsets; the stress mark goes before the longest legal onset
ONSETS = {tuple(o.split()) for o in """
P L|B L|K L|G L|F L|S L|P R|B R|T R|D R|K R|G R|F R|TH R|SH R|T W|D W|K W|G W|S W|TH W|
S P|S T|S K|S M|S N|S F|P Y|B Y|F Y|V Y|K Y|G Y|M Y|HH Y|S P L|S P R|S T R|S K R|S K W|S P Y|S K Y""".replace("\n", "").split("|")}

# Words read differently by POS; CMUdict has no POS, so pick here: (word, pos) -> ARPAbet
HETERONYMS = {
    ("read", "verb"): "R IY1 D", ("lead", "verb"): "L IY1 D", ("lead", "noun"): "L IY1 D",
    ("live", "verb"): "L IH1 V", ("live", "adjective"): "L AY1 V",
    ("close", "verb"): "K L OW1 Z", ("close", "adjective"): "K L OW1 S",
    ("wind", "noun"): "W IH1 N D", ("wind", "verb"): "W AY1 N D",
    ("use", "noun"): "Y UW1 S", ("use", "verb"): "Y UW1 Z",
    ("tear", "noun"): "T IH1 R", ("tear", "verb"): "T EH1 R",
    ("minute", "noun"): "M IH1 N AH0 T", ("excuse", "noun"): "IH0 K S K Y UW1 S", ("excuse", "verb"): "IH0 K S K Y UW1 Z",
    ("record", "noun"): "R EH1 K ER0 D", ("record", "verb"): "R IH0 K AO1 R D",
    ("present", "noun"): "P R EH1 Z AH0 N T", ("present", "adjective"): "P R EH1 Z AH0 N T",
    ("present", "verb"): "P R IY0 Z EH1 N T", ("object", "noun"): "AA1 B JH EH0 K T",
    ("object", "verb"): "AH0 B JH EH1 K T", ("produce", "verb"): "P R AH0 D UW1 S",
    ("increase", "noun"): "IH1 N K R IY2 S", ("increase", "verb"): "IH0 N K R IY1 S",
    ("house", "noun"): "HH AW1 S", ("bow", "verb"): "B AW1", ("row", "noun"): "R OW1",
    ("desert", "noun"): "D EH1 Z ER0 T", ("content", "noun"): "K AA1 N T EH0 N T",
}


def to_ipa(arpabet):
    """ARPAbet with stress digits -> broad US IPA."""
    out = []
    for word in arpabet.split("  "):                      # multi-word entries (rare) are joined by 2 spaces
        ph = word.split()
        vowel_idx = [i for i, p in enumerate(ph) if p[-1].isdigit()]
        marks = {}
        if len(vowel_idx) > 1:
            prev = -1
            for i in vowel_idx:
                stress = ph[i][-1]
                if stress == "1":                         # primary stress only (CMUdict marks secondary stress very often)
                    cons = [p for p in ph[prev + 1:i]]
                    k = 0                                 # onset length of this syllable
                    for n in range(len(cons), 0, -1):
                        if n == 1 and cons[-1] != "NG" or tuple(cons[-n:]) in ONSETS:
                            k = n; break
                    if prev == -1:
                        k = len(cons)                     # first syllable: all leading consonants are the onset
                    marks[i - k] = "ˈ"
                prev = i
        s = ""
        for i, p in enumerate(ph):
            s += marks.get(i, "")
            base, st = (p[:-1], p[-1]) if p[-1].isdigit() else (p, "")
            if base in STRESS_DEP:
                s += STRESS_DEP[base][st in "12"]
            else:
                s += VOWELS.get(base) or CONS[base]
        out.append(s)
    return " ".join(out)


def norm(arpabet):
    """Ignore unstressed vowel differences (orange ˈɔrəndʒ / ˈɔrɪndʒ) when comparing pronunciations."""
    return " ".join("V0" if p[-1] == "0" else p.rstrip("12") for p in arpabet.split())


def load_ref():
    """{word: [ipa, ...]} from ref/cmudict-ipa.tsv (local table); empty if missing."""
    ref = {}
    if os.path.exists(REF):
        with open(REF, encoding="utf-8") as f:
            for r in csv.DictReader(f, delimiter="\t"):
                ref[r["word"]] = [x.strip() for x in r["ipa"].split("|") if x.strip()]
                ref[r["word"] + "\tarpabet"] = [x.strip() for x in r["arpabet"].split("|") if x.strip()]
    return ref


def pick(word, pos, ref):
    """Pick a pronunciation for (word, pos). Returns (ipa, note); ipa is empty if CMUdict lacks the word."""
    w = word.lower()
    arps = ref.get(w + "\tarpabet")
    if not arps:
        return "", ""
    if (w, pos) in HETERONYMS and HETERONYMS[(w, pos)] in arps:
        return to_ipa(HETERONYMS[(w, pos)]), ""
    if len({norm(a) for a in arps}) > 1:
        alts = list(dict.fromkeys(to_ipa(a) for a in arps))
        return to_ipa(arps[0]), (f"CMUdict lists {len(alts)} pronunciations ({' / '.join(alts)}); took the first, "
                                 "fix it if the word is read differently by sense or POS")
    return to_ipa(arps[0]), ""


def build(cmudict_path):
    keep = set()
    with open(os.path.join(ROOT, "ref", "oxford-cefr.tsv"), encoding="utf-8") as f:
        keep |= {r["word"].lower() for r in csv.DictReader(f, delimiter="\t")}
    entries = os.path.join(ROOT, "data", "lexnet-entries.csv")
    if os.path.exists(entries):
        with open(entries, encoding="utf-8-sig") as f:
            keep |= {r["word"].lower() for r in csv.DictReader(f) if r.get("lang") == "en"}
    prons = {}
    with open(cmudict_path, encoding="utf-8") as f:
        for line in f:
            line = line.split("#")[0].strip()
            if not line:
                continue
            head, arp = line.split(" ", 1)
            w = re.sub(r"\(\d+\)$", "", head)
            if w in keep:
                prons.setdefault(w, []).append(arp.strip())
    for w in keep:                                        # compounds (ice cream): join the parts
        if " " in w and w not in prons and all(p in prons for p in w.split()):
            prons[w] = ["  ".join(prons[p][0] for p in w.split())]
    with open(REF, "w", encoding="utf-8", newline="") as f:
        wr = csv.writer(f, delimiter="\t", lineterminator="\n")
        wr.writerow(["word", "ipa", "arpabet"])
        for w in sorted(prons):
            wr.writerow([w, " | ".join(to_ipa(a) for a in prons[w]), " | ".join(prons[w])])
    print(f"wrote {os.path.relpath(REF, ROOT)}: {len(prons)} words (of {len(keep)} needed)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    build(sys.argv[1])
