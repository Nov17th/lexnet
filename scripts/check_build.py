#!/usr/bin/env python3
"""
Check build/lexnet-full.ttl in one go and print PASS or FAIL for each check. Read-only.

    python3 scripts/check_build.py      (after csv_to_ttl.py; about 2 minutes)

Needs rdflib and owlready2 (pip install rdflib owlready2; owlready2 ships HermiT.jar) and Java 11+.

1. The Turtle file parses.
2. SKOS integrity: one prefLabel per language, no broader cycles, no QID used twice.
3. Everything the app can show has an @en and an @vi label.
4. HermiT: the data is consistent; every polysemous word and every reverse confusable pair is
   inferred, and nothing extra; 12 injected faults (one wrong triple each) are all rejected.
   Only consistency and entailment checks are used, not full classification, to keep it fast.
5. The offline demo queries in queries/queries.rq return rows (14-16 are federated; run them in Fuseki).
"""
import os, re, shutil, subprocess, sys, tempfile, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD, QUERIES = ROOT / "build" / "lexnet-full.ttl", ROOT / "queries" / "queries.rq"
FEDERATED = {14, 15, 16}

try:
    import rdflib
    from rdflib import OWL, RDF, URIRef
except ImportError:
    sys.exit("rdflib missing:  pip install rdflib owlready2")
try:
    import owlready2
    HERMIT = Path(owlready2.__file__).parent / "hermit"
except ImportError:
    sys.exit("owlready2 missing (needed for HermiT.jar):  pip install owlready2")
if not shutil.which("java"):
    sys.exit("Java not found (HermiT needs Java 11+).")
if not BUILD.exists():
    sys.exit("build/lexnet-full.ttl not found; run  python3 scripts/csv_to_ttl.py  first.")

OL = rdflib.Namespace("http://www.w3.org/ns/lemon/ontolex#")
failures = []
def report(ok, text):
    print(f"  {'✓' if ok else '✗'} {text}")
    if not ok:
        failures.append(text)

print("1. Parse build/lexnet-full.ttl")
t0 = time.time()
g = rdflib.Graph()
try:
    g.parse(BUILD, format="turtle")
except Exception as ex:
    sys.exit(f"  ✗ Turtle syntax error: {ex}")
L = rdflib.Namespace(dict(g.namespaces())["lexnet"])      # as declared in the ontology
PFX = f"""PREFIX skos:<http://www.w3.org/2004/02/skos/core#> PREFIX owl:<http://www.w3.org/2002/07/owl#>
PREFIX rdfs:<http://www.w3.org/2000/01/rdf-schema#> PREFIX lexnet:<{L}>
PREFIX lexinfo:<http://www.lexinfo.net/ontology/3.0/lexinfo#> PREFIX ontolex:<http://www.w3.org/ns/lemon/ontolex#>
"""
count = lambda cls: len(set(g.subjects(RDF.type, cls)))
print(f"  ✓ {len(g)} triples: {count(L.Concept)} concepts, {count(OL.LexicalEntry)} words, "
      f"{count(OL.LexicalSense)} senses, {count(L.HanCharacter)} Han characters ({time.time() - t0:.0f}s)")
q = lambda text: list(g.query(PFX + text))

print("2. SKOS integrity")
SKOS_CHECKS = {
    "at most one prefLabel per language per resource (S14)":
        "SELECT ?s ?l WHERE { ?s skos:prefLabel ?x BIND(LANG(?x) AS ?l) } GROUP BY ?s ?l HAVING(COUNT(*) > 1)",
    "no skos:broader cycles": "SELECT ?c WHERE { ?c skos:broader+ ?c }",
    "no two concepts exactMatch the same QID":
        "SELECT ?q WHERE { ?c a lexnet:Concept ; skos:exactMatch ?q } GROUP BY ?q HAVING(COUNT(?c) > 1)",
    "no concept has both exactMatch and closeMatch to one QID":
        "SELECT ?c WHERE { ?c skos:exactMatch ?q ; skos:closeMatch ?q }",
    "every concept has at least one word":
        "SELECT ?c WHERE { ?c a lexnet:Concept FILTER NOT EXISTS { ?s ontolex:isLexicalizedSenseOf ?c } }",
    "broader points only to concepts":
        "SELECT ?c WHERE { ?c a lexnet:Concept ; skos:broader ?b FILTER NOT EXISTS { ?b a lexnet:Concept } }",
}
for name, text in SKOS_CHECKS.items():
    bad = q(text)
    report(not bad, name + (f": {len(bad)} violations, e.g. {bad[0][0]}" if bad else ""))

print("3. Display labels (@en and @vi)")
LABEL_CATS = {"class": "?x a owl:Class", "object property": "?x a owl:ObjectProperty",
              "data property": "?x a owl:DatatypeProperty", "concept scheme": "?x a skos:ConceptScheme",
              "level": "?x a lexnet:ProficiencyLevel", "register": "?x a lexnet:Register",
              "part of speech": "?x a lexinfo:PartOfSpeech", "topic": "?x a lexnet:ThematicDomain", "concept": "?x a lexnet:Concept"}
for name, pattern in LABEL_CATS.items():
    for lang in ("en", "vi"):
        bad = q(f"SELECT ?x WHERE {{ {pattern} FILTER(isIRI(?x)) FILTER NOT EXISTS {{ ?x rdfs:label|skos:prefLabel ?l FILTER(LANG(?l) = '{lang}') }} }}")
        if bad:
            report(False, f"{name}: {len(bad)} without an @{lang} label, e.g. {bad[0][0]}")
if not any(f.startswith(tuple(LABEL_CATS)) for f in failures):
    report(True, "all classes, properties, schemes, levels, registers, parts of speech, topics and concepts have @en and @vi labels")

print("4. HermiT reasoner")
TMP = Path(tempfile.mkdtemp(prefix="lexnet-check-"))
CMD = ["java", "-Xmx2000M", "-cp", os.pathsep.join([str(HERMIT), str(HERMIT / "HermiT.jar")]),
       "org.semanticweb.HermiT.cli.CommandLine"]
base_nt = g.serialize(format="nt")
if isinstance(base_nt, bytes):
    base_nt = base_nt.decode("utf-8")
PREMISE = TMP / "premise.nt"; PREMISE.write_text(base_nt, encoding="utf-8")

def nt(triples, declare=False):
    h = rdflib.Graph()
    for t in triples:
        h.add(t)
        if declare:      # the OWL API needs typed terms in the conclusion
            h.add((t[0], RDF.type, OWL.NamedIndividual))
            if t[1] == RDF.type:
                h.add((t[2], RDF.type, OWL.Class))
            else:
                h.add((t[1], RDF.type, OWL.ObjectProperty)); h.add((t[2], RDF.type, OWL.NamedIndividual))
    out = h.serialize(format="nt")
    return out.decode("utf-8") if isinstance(out, bytes) else out

def consistent(extra_triples=()):
    path = TMP / "test.nt"
    path.write_text(base_nt + (nt(extra_triples) if extra_triples else ""), encoding="utf-8")
    r = subprocess.run(CMD + ["-k", path.as_uri()], capture_output=True, text=True)
    if "is satisfiable" in r.stdout:
        return True
    if "Inconsistent" in r.stderr or "not satisfiable" in r.stdout:
        return False
    sys.exit("HermiT error:\n" + r.stderr[-2000:])

def entails(triples):
    concl = TMP / "conclusion.nt"; concl.write_text(nt(triples, declare=True), encoding="utf-8")
    r = subprocess.run(CMD + ["--premise=" + PREMISE.as_uri(), "--conclusion=" + concl.as_uri(), "-E"],
                       capture_output=True, text=True)
    out = r.stdout.strip()
    if out not in ("true", "false"):
        sys.exit("HermiT error in entailment check:\n" + r.stderr[-2000:])
    return out == "true"

t0 = time.time()
base_ok = consistent()
report(base_ok, f"data is consistent ({time.time() - t0:.0f}s)"
       + ("" if base_ok else "; open the build in Protégé, run HermiT and use Explain to find the conflicting triples"))
if base_ok:
    poly = [r[0] for r in q("SELECT ?e WHERE { ?e a ontolex:LexicalEntry ; ontolex:sense ?s } GROUP BY ?e HAVING(COUNT(?s) >= 2) ORDER BY ?e")]
    want = [(e, RDF.type, L.PolysemousEntry) for e in poly]
    conf = [(y, L.confusableWith, x) for x, y in q(
        "SELECT ?x ?y WHERE { VALUES ?p { lexnet:similarGlyph lexnet:similarSound lexnet:similarMeaning } ?x ?p ?y }")]
    chars = [(y, L.similarCharacter, x) for x, y in q("SELECT ?x ?y WHERE { ?x lexnet:similarCharacter ?y }")]
    report(entails(want), f"all {len(poly)} polysemous words inferred: "
           + ", ".join(str(e).rsplit("/", 1)[-1] for e in poly))
    report(entails(conf), f"{len(conf)} confusable pairs inferred under confusableWith, in reverse too")
    if chars:
        report(entails(chars), f"{len(chars)} look-alike character pairs inferred in reverse too")
    one_char = q("SELECT ?c WHERE { ?c a lexnet:HanCharacter } ORDER BY ?c LIMIT 1")
    one_sense = q("SELECT ?e WHERE { ?e a ontolex:LexicalEntry ; ontolex:sense ?s } GROUP BY ?e HAVING(COUNT(?s) = 1) ORDER BY ?e LIMIT 1")
    if one_char:
        report(not entails([(one_char[0][0], RDF.type, OL.LexicalEntry)]), f"no extra inference: character {str(one_char[0][0]).rsplit('/', 1)[-1]} is not a word")
    if one_sense:
        report(not entails([(one_sense[0][0], RDF.type, L.PolysemousEntry)]),
               f"no extra inference: {str(one_sense[0][0]).rsplit('/', 1)[-1]} (one sense) is not polysemous")

    # Injected faults; the sample nodes come from the data, so the test survives data changes
    def pick(text):
        rows = q(text + " LIMIT 1")
        return rows[0] if rows else None
    sl = pick("SELECT ?s ?l ?l2 WHERE { ?s lexnet:level ?l . ?l2 a lexnet:ProficiencyLevel FILTER(?l2 != ?l) } ORDER BY ?s ?l2")
    sr = pick("SELECT ?s ?r2 WHERE { ?s lexnet:register ?r . ?r2 a lexnet:Register FILTER(?r2 != ?r) } ORDER BY ?s ?r2")
    sc = pick("SELECT ?s ?c ?c2 WHERE { ?s ontolex:isLexicalizedSenseOf ?c . ?c2 a lexnet:Concept FILTER(?c2 != ?c) } ORDER BY ?s ?c2")
    lv = pick("SELECT ?l WHERE { ?l a lexnet:ProficiencyLevel } ORDER BY ?l")
    ee = pick("SELECT ?e ?e2 WHERE { ?e a ontolex:LexicalEntry . ?e2 a ontolex:LexicalEntry FILTER(?e != ?e2) } ORDER BY ?e ?e2")
    ch = pick("SELECT ?c ?c2 WHERE { ?c lexnet:hasRadical ?r . ?c2 a lexnet:HanCharacter FILTER(?c != ?c2) } ORDER BY ?c ?c2")
    fr = pick("SELECT ?f ?r WHERE { ?f lexnet:hasCharacter ?c . ?r a lexnet:Radical } ORDER BY ?f ?r")
    tc = pick("SELECT ?c ?c2 WHERE { ?c lexnet:inDomain ?t . ?c2 a lexnet:Concept FILTER(?c != ?c2) } ORDER BY ?c ?c2")
    TESTS = []
    if sl: TESTS.append(("a sense with two levels", [(sl[0], L.level, sl[2])]))
    if sr: TESTS.append(("a sense with two registers", [(sr[0], L.register, sr[1])]))
    if sc: TESTS += [("level points to a concept", [(sc[0], L.level, sc[2])]),
                     ("example points to a concept", [(sc[0], L.hasExample, sc[2])]),
                     ("a sense of two concepts", [(sc[0], OL.isLexicalizedSenseOf, sc[2])])]
    if sc and lv: TESTS.append(("register points to a level", [(sc[0], L.register, lv[0])]))
    if ch: TESTS.append(("radical points to a character", [(ch[0], L.hasRadical, ch[1])]))
    if fr: TESTS.append(("form contains a radical", [(fr[0], L.hasCharacter, fr[1])]))
    if ee and sc: TESTS.append(("canonical form points to a concept", [(ee[0], OL.canonicalForm, sc[2])]))
    if tc: TESTS.append(("topic points to a concept", [(tc[0], L.inDomain, tc[1])]))
    if ee: TESTS += [("antonym between two words (not concepts)", [(ee[0], L.antonym, ee[1])]),
                     ("similarCharacter between two words (not characters)", [(ee[0], L.similarCharacter, ee[1])])]
    caught = 0
    for name, triples in TESTS:
        hit = not consistent(triples)
        caught += hit
        if not hit:
            report(False, f"injected fault missed: {name}")
    report(caught == len(TESTS) == 12, f"injected faults: reasoner caught {caught}/{len(TESTS)}")
shutil.rmtree(TMP, ignore_errors=True)

print("5. Demo queries (run locally; 14-16 are federated and run in Fuseki)")
parts = re.split(r"(?m)^# --- (\d+)\)", QUERIES.read_text(encoding="utf-8"))
counts = []
for i in range(1, len(parts), 2):
    n = int(parts[i])
    if n in FEDERATED:
        continue
    try:
        rows = len(list(g.query("#" + parts[i + 1])))   # the rest of the header line becomes a comment
    except Exception as ex:
        report(False, f"query {n} failed: {ex}")
        continue
    counts.append(f"{n}:{rows}")
    if rows == 0:
        report(False, f"query {n} returned no rows")
report(not any(f.startswith("query ") for f in failures), "rows per query: " + " ".join(counts))

print()
print("RESULT: PASS ✓" if not failures else f"RESULT: {len(failures)} FAILED ✗")
sys.exit(1 if failures else 0)