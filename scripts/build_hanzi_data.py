#!/usr/bin/env python3
"""
Rebuild data/hanzi-unihan.tsv from the Unicode Han Database (Unihan). The file is already in the
repository; this script documents where it comes from.

    python3 scripts/build_hanzi_data.py      (downloads from unicode.org and GitHub)

Columns
  radical_num     Kangxi radical number from kRSUnicode; ' marks the simplified form (184' = 饣)
  strokes         mainland count from the Make Me a Hanzi glyphs for characters in the PRC standard
                  list (kTGHZ2013), else kTotalStrokes. Unihan counts Kangxi shapes (艹 = 4 strokes),
                  so 花, 猫, 茶 would get one stroke too many and 致 one too few.
  common_reading  kMandarin
  readings        all standard readings, "/"-separated: kTGHZ2013 (通用规范汉字字典), else kXHC1983
                  (现代汉语词典), else kMandarin
  definition      first part of kDefinition
Licences: Unihan, Unicode License v3; Make Me a Hanzi, Arphic Public License.
"""
import io, json, os, urllib.request, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "hanzi-unihan.tsv")
UNIHAN = "https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip"
RADS = "https://www.unicode.org/Public/UCD/latest/ucd/CJKRadicals.txt"
MMAH = "https://raw.githubusercontent.com/skishore/makemeahanzi/master/graphics.txt"
KEYS = ("kRSUnicode", "kTotalStrokes", "kMandarin", "kDefinition", "kTGHZ2013", "kXHC1983")

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "LexNet-student-project"})
    return urllib.request.urlopen(req, timeout=300).read()

def readings_from(value):
    """'171.020:jiào 188.110:jué' -> ['jiào', 'jué'] (drop page positions, keep order, no duplicates)."""
    out = []
    for item in value.split():
        for r in item.split(":", 1)[-1].split(","):
            if r and r not in out:
                out.append(r)
    return out

radical_char = {}
for line in fetch(RADS).decode("utf-8").splitlines():
    if line and not line.startswith("#"):
        num, _block_cp, unified_cp = [x.strip() for x in line.split(";")]
        radical_char[num] = chr(int(unified_cp, 16))

data = {}
with zipfile.ZipFile(io.BytesIO(fetch(UNIHAN))) as z:
    for name in z.namelist():
        for line in io.TextIOWrapper(z.open(name), encoding="utf-8"):
            if not line.startswith("U+"):
                continue
            cp, key, val = line.rstrip("\n").split("\t")
            code = int(cp[2:], 16)
            if key in KEYS and 0x4E00 <= code <= 0x9FFF:      # basic CJK Unified Ideographs block
                data.setdefault(chr(code), {})[key] = val

# Mainland stroke counts: number of strokes in the Make Me a Hanzi glyph data
mmah_strokes = {}
for line in fetch(MMAH).decode("utf-8").splitlines():
    if line.strip():
        d = json.loads(line)
        mmah_strokes[d["character"]] = len(d["strokes"])

rows = 0
with open(OUT, "w", encoding="utf-8") as f:
    f.write("char\tradical_num\tradical_char\tstrokes\tcommon_reading\treadings\tdefinition\n")
    for ch in sorted(data):
        d = data[ch]
        if "kRSUnicode" not in d or "kMandarin" not in d:
            continue
        rnum = d["kRSUnicode"].split()[0].split(".")[0]         # "94.9" -> "94" ; "184'.4" -> "184'"
        common = d["kMandarin"].split()[0]
        readings = (readings_from(d["kTGHZ2013"]) if "kTGHZ2013" in d else
                    readings_from(d["kXHC1983"]) if "kXHC1983" in d else [common])
        if common not in readings:
            readings.append(common)
        strokes = d["kTotalStrokes"].split()[0] if d.get("kTotalStrokes") else ""
        if ch in mmah_strokes and "kTGHZ2013" in d:
            strokes = str(mmah_strokes[ch])
        defn = d.get("kDefinition", "").split(";")[0].split(",")[0].strip().replace("\t", " ")
        f.write(f"{ch}\t{rnum}\t{radical_char.get(rnum, '')}\t{strokes}\t{common}\t{'/'.join(readings)}\t{defn}\n")
        rows += 1
print(f"wrote {OUT}: {rows} characters")
