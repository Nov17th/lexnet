import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { detailRoute } from "../src/lib/resourceRoutes";
import type {
  Entry,
  Character,
  Stats,
  Graph,
  Word,
  QueryResult,
  AudioResult,
  Entity,
  Level,
} from "../src/lib/types";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const app = process.env.TEST_APP_URL || "http://127.0.0.1:3000";
const endpoint =
  process.env.SPARQL_ENDPOINT || "http://localhost:3030/lexnet/query";
let passed = 0;
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
}
async function api<T>(
  action: string,
  params: Record<string, string> = {},
  options?: RequestInit,
): Promise<T> {
  const r = await fetch(
    `${app}/api/${action}?${new URLSearchParams(params)}`,
    options,
  );
  const data = await r.json();
  assert.ok(r.ok, JSON.stringify(data));
  assert.equal(r.headers.get("cache-control"), "no-store");
  return data;
}
async function search(q: string) {
  return (await api<{ entries: Word[] }>("search", { q })).entries;
}
async function word(q: string) {
  const results = await search(q);
  assert.ok(results.length, `${q} was not found`);
  return results.find((w) => w.writtenRep === q) || results[0];
}
async function entry(q: string) {
  return api<Entry>("entry", { iri: (await word(q)).iri });
}
async function sparql(query: string) {
  return api<{ result: QueryResult }>(
    "sparql",
    {},
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    },
  );
}
await check("health and real RDF data", async () => {
  assert.equal((await api<{ connected: boolean }>("health")).connected, true);
});
await check(
  "configured resource namespace and hash IRI links survive URL transport",
  async () => {
    const base =
      process.env.LEXNET_RESOURCE_BASE ||
      "https://nov17th.github.io/lexnet/build/lexnet-full.ttl#";
    const e = await entry("cat");
    assert.ok(e.iri.startsWith(base));
    assert.ok(
      e.senses.every(
        (s) => s.iri.startsWith(base) && s.conceptIri.startsWith(base),
      ),
    );
    const c = await api<Character>("character", { character: "人" });
    for (const id of [e.iri, e.senses[0].conceptIri, c.iri]) {
      const href = detailRoute(id);
      assert.ok(href);
      const url = new URL(href, app);
      assert.equal(url.hash, "");
      assert.equal(url.searchParams.get("iri"), id);
      assert.equal((await fetch(url)).status, 200);
    }
  },
);
await check(
  "cat / mèo / 猫 share concepts and three languages, no duplicate senses",
  async () => {
    const entries = await Promise.all(["cat", "mèo", "猫"].map(entry));
    const cid = entries[0].senses[0].conceptIri;
    for (const e of entries) {
      assert.equal(e.senses[0].conceptIri, cid);
      assert.deepEqual(
        new Set(e.senses[0].concept.words.map((w) => w.language)),
        new Set(["en", "vi", "zh"]),
      );
      assert.equal(new Set(e.senses.map((s) => s.iri)).size, e.senses.length);
    }
  },
);
await check(
  "NFC/NFD, English case-insensitivity and quote injection",
  async () => {
    assert.deepEqual(await search("mèo"), await search("mèo"));
    assert.equal((await search("CAT"))[0].iri, (await search("cat"))[0].iri);
    assert.deepEqual(await search('" } UNION { ?s ?p ?o } #'), []);
  },
);
await check(
  "bank has separate concept identities, examples and levels",
  async () => {
    const e = await entry("bank");
    assert.equal(e.senses.length, 2);
    assert.equal(new Set(e.senses.map((s) => s.conceptIri)).size, 2);
    assert.equal(new Set(e.senses.map((s) => s.level?.iri)).size, 2);
    for (const s of e.senses) {
      assert.ok(s.examples.length);
      assert.equal(
        new Set(s.examples.map((e) => e.value)).size,
        s.examples.length,
      );
    }
    assert.notDeepEqual(e.senses[0].examples, e.senses[1].examples);
  },
);
await check("cool register and level follow current source", async () => {
  const e = await entry("cool");
  const informal = e.senses.find((s) => s.register);
  assert.ok(informal?.level);
  console.log(
    `DATA NOTE cool informal sense level in loaded RDF: ${informal.level.label}.`,
  );
});
await check(
  "drink and năm retain different entries for parts of speech",
  async () => {
    for (const q of ["drink", "năm"]) {
      const exact = (await search(q)).filter((w) => w.writtenRep === q);
      assert.ok(exact.length >= 2);
      assert.equal(new Set(exact.map((w) => w.iri)).size, exact.length);
      assert.ok(
        new Set(exact.flatMap((w) => w.pos.map((p) => p.iri))).size >= 2,
      );
    }
  },
);
await check(
  "Animal + Chinese + HSK rank <= 2 returns matching senses",
  async () => {
    const topics = await api<Entity[]>("topics");
    const levels = await api<Level[]>("levels");
    const animal = topics.find((t) =>
      /^animals?$/u.test(t.label.toLowerCase()),
    );
    const hsk = levels.find((l) => l.schemeLabel.startsWith("HSK"));
    assert.ok(animal && hsk);
    const result = await api<{ items: (Word & { concept: Entity })[] }>(
      "browse",
      { topic: animal.iri, language: "zh", scheme: hsk.scheme, maxRank: "2" },
    );
    assert.deepEqual(
      new Set(result.items.map((w) => w.writtenRep)),
      new Set(["狗", "猫", "鱼", "鸟"]),
    );
    for (const w of result.items) {
      assert.ok(w.level?.rank && w.level.rank <= 2);
      assert.equal(w.language, "zh");
    }
  },
);
await check("reverse confusable lookup 卖 discovers 买", async () => {
  assert.ok((await entry("卖")).confusables.some((w) => w.writtenRep === "买"));
});
await check("compound 白色 discovers character-level 百", async () => {
  const e = await entry("白色");
  assert.deepEqual(
    e.characters.map((c) => c.label),
    ["白", "色"],
  );
  const c = await api<Character>("character", { iri: e.characters[0].iri });
  assert.ok(c.similar.some((c) => c.label === "百"));
  const similar = await api<Character>("character", {
    iri: c.similar.find((c) => c.label === "百")!.iri,
  });
  assert.ok(similar.words.length);
});
await check(
  "睡觉 has ordered characters and independent multiple readings",
  async () => {
    const e = await entry("睡觉");
    assert.deepEqual(
      e.characters.map((c) => c.label),
      ["睡", "觉"],
    );
    const c = await api<Character>("character", { iri: e.characters[1].iri });
    assert.ok(c.readings.length >= 2);
    assert.ok(c.commonReadings.length);
    assert.ok(!e.phonetics.some((p) => c.readings.includes(p.value)));
  },
);
await check(
  "runtime stats agree with independent aggregate query",
  async () => {
    const stats = await api<Stats>("stats");
    const result = (
      await sparql(
        "PREFIX ontolex: <http://www.w3.org/ns/lemon/ontolex#> SELECT (COUNT(DISTINCT ?e) AS ?n) WHERE {?e a ontolex:LexicalEntry}",
      )
    ).result;
    assert.equal(result.kind, "SELECT");
    if (result.kind === "SELECT")
      assert.equal(stats.counts.LexicalEntry, Number(result.rows[0].n.value));
    for (const l of stats.languages) {
      assert.equal(l.examples.denominator, l.senses);
      assert.equal(l.lexemes.denominator, l.entries);
      assert.ok(l.examples.numerator <= l.examples.denominator);
    }
    assert.equal(stats.matches.either.denominator, stats.counts.Concept);
  },
);
await check(
  "local graph limits, identity, labels and one-step expansion API",
  async () => {
    const root = await word("cat");
    const g = await api<Graph>("graph", {
      iri: root.iri,
      depth: "2",
      nodes: "15",
      edges: "20",
    });
    assert.ok(g.nodes.length <= 15 && g.edges.length <= 20);
    assert.equal(new Set(g.nodes.map((n) => n.id)).size, g.nodes.length);
    assert.equal(new Set(g.edges.map((e) => e.id)).size, g.edges.length);
    const node = g.nodes.find((n) => n.id !== root.iri)!;
    assert.ok(node);
    const expanded = await api<Graph>("graph", { iri: node.iri, depth: "1" });
    assert.ok(expanded.nodes.length);
    for (const e of expanded.edges) {
      assert.ok(
        expanded.nodes.some((n) => n.id === e.source) &&
          expanded.nodes.some((n) => n.id === e.target),
      );
      assert.equal(e.provenance, "Asserted");
    }
  },
);
await check(
  "SELECT / ASK / CONSTRUCT / DESCRIBE results remain typed",
  async () => {
    assert.equal(
      (await sparql("SELECT ?s WHERE {?s ?p ?o} LIMIT 2")).result.kind,
      "SELECT",
    );
    const ask = (await sparql("ASK {?s ?p ?o}")).result;
    assert.equal(ask.kind, "ASK");
    if (ask.kind === "ASK") assert.equal(ask.boolean, true);
    for (const query of [
      "CONSTRUCT {?s ?p ?o} WHERE {?s ?p ?o} LIMIT 2",
      `DESCRIBE <${(await word("cat")).iri}>`,
    ]) {
      const r = (await sparql(query)).result;
      assert.ok(r.kind === "CONSTRUCT" || r.kind === "DESCRIBE");
      if (r.kind === "CONSTRUCT" || r.kind === "DESCRIBE")
        assert.ok(r.triples.every((t) => t.predicate.type === "uri"));
    }
  },
);
await check(
  "syntax errors, update requests and endpoint override are rejected",
  async () => {
    for (const body of [
      { query: "SELECT WHERE {" },
      { query: "# comment\nPREFIX x: <http://x/> INSERT DATA {x:a x:b x:c}" },
      { query: "ASK {}", endpoint: "http://example.org" },
    ]) {
      const r = await fetch(app + "/api/sparql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.equal(r.status, 400);
      assert.ok((await r.json()).error);
    }
    const upstream = await fetch(new URL("update", endpoint), {
      method: "POST",
      headers: { "Content-Type": "application/sparql-update" },
      body: "INSERT DATA {<http://test/s> <http://test/p> <http://test/o>}",
    });
    assert.ok(!upstream.ok);
  },
);
await check(
  "all three derived calculations return read-query results",
  async () => {
    for (const kind of ["polysemy", "shared", "confusables"]) {
      const q = kind === "confusables" ? "卖" : "cat";
      const r = await api<QueryResult>("derived", {
        kind,
        iri: (await word(q)).iri,
      });
      assert.equal(r.kind, "SELECT");
      if (r.kind === "SELECT") assert.ok(r.rows.length);
    }
  },
);
await check("application pages render and ship source-based UI", async () => {
  for (const page of [
    "/",
    "/topics",
    "/developer",
    "/entry",
    "/concept",
    "/character",
  ]) {
    const r = await fetch(app + page);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /LexNet/);
  }
});
for (const q of ["dog", "人", "bánh mì"]) {
  const r = await api<AudioResult>("audio", { iri: (await word(q)).iri });
  assert.ok(
    ["available", "unavailable", "error", "disabled"].includes(r.status),
  );
  console.log(
    `EXTERNAL AUDIO ${q}: ${r.status}${r.message ? " — " + r.message : ""}`,
  );
  if (r.status === "available") {
    // A successful file fetch still does not assert successful browser playback.
    try {
      const file = await fetch(r.candidates[0].url, {
        headers: { Range: "bytes=0-63" },
        signal: AbortSignal.timeout(8000),
      });
      const reader = file.body?.getReader();
      const chunk = await reader?.read();
      await reader?.cancel();
      console.log(
        `EXTERNAL AUDIO FILE ${q}: HTTP ${file.status}, ${file.headers.get("content-type")}, ${chunk?.value?.length || 0} bytes received`,
      );
    } catch (e) {
      console.log(
        `EXTERNAL AUDIO FILE ${q}: unavailable — ${e instanceof Error ? e.message : "request failed"}`,
      );
    }
  }
}

// Dataset replacement is isolated: no mutations to source RDF or the user's endpoint.
await check(
  "separate Fuseki dataset replacement: add, remove, empty, outage, optional data and repeated characters",
  async () => {
    const root = resolve(".");
    const scratch = resolve(".runtime/integration");
    await mkdir(scratch, { recursive: true });
    const fusekiHome =
      process.env.FUSEKI_HOME ||
      resolve(
        ".tools",
        readdirSync(".tools").find(
          (n) =>
            n.startsWith("apache-jena-fuseki-") &&
            existsSync(join(".tools", n, "fuseki-server.jar")),
        )!,
      );
    const javaHome =
      process.env.JAVA_HOME ||
      resolve(
        ".tools",
        readdirSync(".tools").find(
          (n) => n.startsWith("jdk-") && existsSync(join(".tools", n, "bin")),
        )!,
      );
    const java = join(
      javaHome,
      "bin",
      process.platform === "win32" ? "java.exe" : "java",
    );
    const file = join(scratch, "dataset.ttl");
    process.env.SPARQL_ENDPOINT = "http://127.0.0.1:3031/lexnet/query";
    const repo = await import("../src/lib/repositories");
    const { upstream } = await import("../src/lib/sparqlClient");
    const { config } = await import("../src/lib/namespaces");
    let child: ChildProcess | undefined;
    const stop = async () => {
      if (child) {
        const exit = new Promise<void>((r) => child!.once("exit", () => r()));
        child.kill();
        await exit;
        child = undefined;
      }
    };
    const start = async (data: string) => {
      await writeFile(file, data);
      child = spawn(
        java,
        [
          "-jar",
          join(fusekiHome, "fuseki-server.jar"),
          "--port=3031",
          `--file=${file}`,
          "/lexnet",
        ],
        {
          cwd: root,
          stdio: "ignore",
          env: {
            ...process.env,
            FUSEKI_HOME: fusekiHome,
            FUSEKI_BASE: join(scratch, "fuseki"),
          },
        },
      );
      for (let n = 0; n < 100; n++) {
        if (child.exitCode !== null)
          throw new Error("Test Fuseki exited before startup");
        try {
          const r = await fetch(
            "http://127.0.0.1:3031/lexnet/query?query=ASK%7B%7D",
          );
          if (r.ok) return;
        } catch {}
        await delay(150);
      }
      throw new Error("Test Fuseki startup timeout");
    };
    const initial = await readFile(
      process.env.LEXNET_RDF_FILE || "../build/lexnet-full.ttl",
      "utf8",
    );
    const testBase = `${config.base}test/`;
    const addition = `\n@prefix test: <${testBase}> .\ntest:topic a lexnet:ThematicDomain ; skos:prefLabel "Replacement topic"@en .\ntest:concept a lexnet:Concept ; skos:prefLabel "Replacement concept"@en ; lexnet:inDomain test:topic .\ntest:entry a ontolex:LexicalEntry ; ontolex:canonicalForm test:form ; ontolex:sense test:sense .\ntest:form a ontolex:Form ; ontolex:writtenRep "replacementprobe"@en .\ntest:sense a ontolex:LexicalSense ; ontolex:isLexicalizedSenseOf test:concept .\ntest:repeatedEntry a ontolex:LexicalEntry ; ontolex:canonicalForm test:repeatedForm .\ntest:repeatedForm a ontolex:Form ; ontolex:writtenRep "人人"@zh ; lexnet:hasCharacter <${config.base}char/人> .\n`;
    try {
      await start(initial);
      const before = await repo.stats();
      assert.deepEqual(await repo.search("replacementprobe"), []);
      await stop();
      await start(initial + addition);
      const added = await repo.search("replacementprobe");
      assert.equal(added.length, 1);
      const e = await repo.entry(added[0].iri);
      assert.equal(e.senses.length, 1);
      assert.equal(e.senses[0].level, undefined);
      assert.equal(e.senses[0].register, undefined);
      assert.deepEqual(e.senses[0].examples, []);
      const after = await repo.stats();
      assert.equal(after.counts.LexicalEntry, before.counts.LexicalEntry + 2);
      assert.equal(after.counts.LexicalSense, before.counts.LexicalSense + 1);
      assert.equal(after.counts.Topic, before.counts.Topic + 1);
      assert.ok(
        (await repo.topics()).some((t) => t.label === "Replacement topic"),
      );
      assert.equal(
        (
          await repo.browse({
            topic: `${testBase}topic`,
            page: 1,
          })
        ).items.length,
        1,
      );
      assert.deepEqual(
        (await repo.entry(`${testBase}repeatedEntry`)).characters.map(
          (c) => c.label,
        ),
        ["人", "人"],
      );
      await stop();
      await start(initial);
      assert.deepEqual(await repo.search("replacementprobe"), []);
      assert.deepEqual((await repo.stats()).counts, before.counts);
      assert.ok(
        !(await repo.topics()).some((t) => t.label === "Replacement topic"),
      );
      await stop();
      await start("");
      const empty = await repo.stats();
      assert.ok(Object.values(empty.counts).every((c) => c === 0));
      assert.ok(
        empty.languages.every(
          (l) => l.levels.ratio === null && l.examples.ratio === null,
        ),
      );
      await stop();
      await assert.rejects(
        () => upstream("ASK {}"),
        /Cannot reach SPARQL endpoint/,
      );
    } finally {
      await stop();
    }
  },
);
console.log(
  `\n${passed} integration groups passed against real Fuseki and HTTP routes.`,
);
