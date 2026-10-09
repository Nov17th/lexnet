import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { Parser } from "sparqljs";
import {
  config,
  literal,
  iri,
  resource,
  prefixes,
} from "../src/lib/namespaces";
import { detailRoute } from "../src/lib/resourceRoutes";
import { labels, entity, words, group, level } from "../src/lib/bindingParsers";
import { parseReadQuery } from "../src/lib/sparqlClient";
import {
  searchQuery,
  sharedQuery,
  confusablesQuery,
  polysemyQuery,
} from "../src/lib/queryBuilders";
import { selectAudioCandidates } from "../src/lib/wikidataClient";
import { parseQuerySamples, querySamples } from "../src/lib/querySamples";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Row } from "../src/lib/types";
const uri = (value: string) => ({ type: "uri" as const, value });
const text = (value: string, language?: string) => ({
  type: "literal" as const,
  value,
  ...(language ? { "xml:lang": language } : {}),
});
test("literal serialization preserves NFC, quotes, slash and Unicode without breaking SPARQL", () => {
  for (const input of ["mèo", `a'"\\b\n猫`, '" } UNION { ?s ?p ?o } #']) {
    const query = searchQuery(input, "auto", 20);
    assert.doesNotThrow(() => new Parser().parse(prefixes + "\n" + query));
    assert.equal(JSON.parse(literal(input)), input.normalize("NFC").trim());
  }
  assert.equal(literal(" mèo "), literal("mèo"));
});
test("IRI validation rejects query injection and foreign resource namespace", () => {
  assert.equal(resource(`${config.base}char/猫`), `<${config.base}char/猫>`);
  for (const value of [
    "http://x/> ?s ?p ?o",
    "javascript:alert(1)",
    "http://x/\n",
    "http://x/\\",
  ])
    assert.throws(() => iri(value));
  assert.throws(() => resource("http://elsewhere.test/entry/a"));
  assert.equal(
    resource(`${config.schema}level/HSK_2`),
    `<${config.schema}level/HSK_2>`,
  );
});

test("detail links preserve hash and slash IRIs, Unicode and query delimiters", () => {
  for (const base of [config.base, "http://example.org/lexnet/"]) {
    for (const [kind, page] of [
      ["entry", "entry"],
      ["concept", "concept"],
      ["char", "character"],
    ]) {
      const id = `${base}${kind}/猫_&?noun`;
      const href = detailRoute(id);
      assert.ok(href);
      const url = new URL(href, "http://localhost:3000");
      assert.equal(url.pathname, `/${page}`);
      assert.equal(url.hash, "");
      assert.equal(url.searchParams.get("iri"), id);
    }
  }
  assert.equal(detailRoute(`${config.schema}Concept`), undefined);
  assert.equal(detailRoute("http://www.wikidata.org/entity/Q146"), undefined);
});

test("sample environment preserves the complete published hash namespaces", () => {
  const env = parseEnv(readFileSync(".env.example", "utf8"));
  assert.equal(
    env.LEXNET_RESOURCE_BASE,
    "https://nov17th.github.io/lexnet/build/lexnet-full.ttl#",
  );
  assert.equal(
    env.LEXNET_SCHEMA_IRI,
    "https://nov17th.github.io/lexnet/ontology/lexnet-ontology.ttl#",
  );
});
test("grouping deduplicates literal joins, preserves entries and exact language tags", () => {
  const a: Row = {
    entry: uri(`${config.base}entry/a`),
    form: uri(`${config.base}form/a`),
    written: text("drink", "en"),
    pos: uri("http://lexinfo/verb"),
    posLabel: text("verb", "en"),
    phonetic: text("drɪŋk", "en-US-fonipa"),
  };
  const b: Row = {
    ...a,
    entry: uri(`${config.base}entry/b`),
    pos: uri("http://lexinfo/noun"),
    posLabel: text("noun", "en"),
  };
  const parsed = words([a, a, { ...a, posLabel: text("động từ", "vi") }, b]);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].pos.length, 1);
  assert.equal(parsed[0].phonetics.length, 1);
  assert.equal(parsed[0].phonetics[0].language, "en-US-fonipa");
  assert.equal(parsed[0].pos[0].label, "verb");
  assert.equal(labels([a, a], "phonetic").length, 1);
  assert.equal(level([a]), undefined);
});
test("same labels never collapse distinct concept or sense IRIs", () => {
  const rows: Row[] = [
    { sense: uri("sense:one"), label: text("bank", "en") },
    { sense: uri("sense:two"), label: text("bank", "en") },
  ];
  assert.equal(group(rows, "sense").size, 2);
  assert.notEqual(
    entity("concept:one", labels(rows)).iri,
    entity("concept:two", labels(rows)).iri,
  );
});
test("read query parser accepts SELECT/ASK/CONSTRUCT/DESCRIBE and rejects updates after prefixes/comments", () => {
  for (const query of [
    "SELECT * WHERE {?s ?p ?o}",
    "ASK {?s ?p ?o}",
    "CONSTRUCT {?s ?p ?o} WHERE {?s ?p ?o}",
    "DESCRIBE <http://example.org/a>",
  ])
    assert.equal(parseReadQuery(query).type, "query");
  for (const query of [
    "# read only?\nPREFIX x: <http://x/> INSERT DATA {x:a x:b x:c}",
    "DELETE WHERE {?s ?p ?o}",
    "LOAD <http://example.org/data>",
    "CLEAR ALL",
    "DROP ALL",
    "CREATE GRAPH <http://x/>",
  ])
    assert.throws(() => parseReadQuery(query));
  assert.throws(() => parseReadQuery("SELECT WHERE {"));
});
test("derived query builders parse and use actual sense paths and both directions", () => {
  const id = `${config.base}entry/zh_卖_verb`;
  for (const q of [sharedQuery(id), confusablesQuery(id), polysemyQuery])
    assert.doesNotThrow(() => new Parser().parse(prefixes + "\n" + q));
  assert.match(sharedQuery(id), /ontolex:sense\/ontolex:isLexicalizedSenseOf/);
  assert.match(confusablesQuery(id), /UNION/);
  assert.match(polysemyQuery, /COUNT\(DISTINCT \?sense\)/);
});
test("audio adapter selects exact lexical form, preserves MIME, deduplicates and refuses unrelated hosts", () => {
  const row = (representation: string, url: string, language = "en"): Row => ({
    representation: text(representation, language),
    audio: uri(url),
    lexeme: uri("http://www.wikidata.org/entity/L1"),
  });
  const correct = row(
    "dog",
    "http://commons.wikimedia.org/wiki/Special:FilePath/En-dog.ogg",
  );
  const candidates = selectAudioCandidates(
    [
      correct,
      correct,
      row(
        "dogs",
        "http://commons.wikimedia.org/wiki/Special:FilePath/En-dogs.ogg",
      ),
      row("dog", "https://evil.example/audio.ogg"),
      row(
        "dog",
        "http://commons.wikimedia.org/wiki/Special:FilePath/En-dog.wav",
        "de",
      ),
    ],
    "dog",
    "en",
  );
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].mime, "audio/ogg");
  assert.equal(candidates[0].label, "En-dog.ogg");
  assert.equal(
    selectAudioCandidates(
      [
        row(
          "人",
          "http://commons.wikimedia.org/wiki/Special:FilePath/Zh-ren.wav",
          "zh",
        ),
      ],
      "人",
      "zh",
    )[0].mime,
    "audio/wav",
  );
});

test("audio labels use pronunciation qualifiers, prefer American English and upgrade duplicate unqualified rows", () => {
  const row = (file: string, variety?: string): Row => ({
    representation: text("bank", "en"),
    audio: uri(`http://commons.wikimedia.org/wiki/Special:FilePath/${file}`),
    lexeme: uri("http://www.wikidata.org/entity/L3354"),
    ...(variety ? { varietyLabel: text(variety, "en") } : {}),
  });
  const candidates = selectAudioCandidates(
    [
      row("En-uk-bank.ogg", "British English"),
      row("En-us-bank.ogg"),
      row("En-us-bank.ogg", "American English"),
      row("En-us-bank.ogg", "American English"),
      row("Bank%20pronunciation.wav"),
    ],
    "bank",
    "en",
  );
  assert.equal(candidates.length, 3);
  assert.equal(candidates[0].label, "American English");
  assert.ok(candidates.some((c) => c.label === "British English"));
  assert.ok(candidates.some((c) => c.label === "Bank pronunciation.wav"));
  assert.ok(candidates.every((c) => c.source.endsWith("/L3354")));
});

test("repository query samples keep all 18 headers, prefixes and three federated queries", () => {
  const samples = parseQuerySamples(
    readFileSync("../queries/queries.rq", "utf8"),
  );
  assert.equal(samples.length, 18);
  assert.equal(samples.filter((s) => s.federated).length, 3);
  assert.equal(new Set(samples.map((s) => s.id)).size, 18);
  for (const s of samples)
    assert.equal(new Parser().parse(s.query).type, "query");
  const inherited = parseQuerySamples(
    "PREFIX ex: <http://example.org/>\r\n# --- 1) Shared prefixes\r\nSELECT ?x WHERE { ?x ex:p ?o }",
  );
  assert.equal(inherited[0].title, "1) Shared prefixes");
  assert.equal(new Parser().parse(inherited[0].query).type, "query");
});

test("query sample loader re-reads the file and reports a missing source", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "lexnet-query-samples-"));
  const file = join(scratch, "queries.rq");
  const previous = process.env.LEXNET_QUERIES_FILE;
  try {
    process.env.LEXNET_QUERIES_FILE = file;
    await writeFile(file, "# --- 1) First\nASK {}");
    assert.equal((await querySamples())[0].title, "1) First");
    await writeFile(file, "# --- 2) Changed\nASK {}");
    assert.equal((await querySamples())[0].title, "2) Changed");
    await unlink(file);
    await assert.rejects(querySamples, /Cannot read demo queries/);
  } finally {
    if (previous === undefined) delete process.env.LEXNET_QUERIES_FILE;
    else process.env.LEXNET_QUERIES_FILE = previous;
    await rmdir(scratch);
  }
});
