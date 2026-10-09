import { select } from "./sparqlClient";
import { config, ns, resource, literal, localName } from "./namespaces";
import {
  entity,
  group,
  labels,
  level,
  preferred,
  unique,
  value,
  words,
} from "./bindingParsers";
import {
  wordFields,
  levelFields,
  searchQuery,
  confusablesQuery,
} from "./queryBuilders";
import type {
  Character,
  Concept,
  Coverage,
  Entry,
  Graph,
  Row,
  Stats,
} from "./types";

const meta = async (id: string) =>
  select(
    `SELECT ?predicate ?object WHERE { ${resource(id)} ?predicate ?object }`,
  );
const objects = (rows: Row[], p: string) =>
  rows.filter((r) => value(r, "predicate") === p).map((r) => r.object);
const literals = (rows: Row[], p: string) =>
  objects(rows, p).map((b) => ({
    value: b.value,
    language: b["xml:lang"],
    datatype: b.datatype,
  }));
const entityMeta = (id: string, rs: Row[]) =>
  entity(id, [
    ...literals(rs, ns.skos + "prefLabel"),
    ...literals(rs, ns.rdfs + "label"),
  ]);
export async function search(q: string, language = "auto", limit = 20) {
  return words(await select(searchQuery(q, language, limit)));
}
export async function topics() {
  return [
    ...group(
      await select(
        "SELECT ?topic ?label WHERE { ?topic a lexnet:ThematicDomain . OPTIONAL { ?topic skos:prefLabel ?label } } ORDER BY ?topic",
      ),
      "topic",
    ),
  ].map(([id, rs]) => entity(id, labels(rs)));
}
export async function levels() {
  return [
    ...group(
      await select(
        `SELECT ?level ?levelLabel ?notation ?scheme ?schemeLabel ?rank WHERE { ?level a lexnet:ProficiencyLevel . OPTIONAL { ?level skos:prefLabel ?levelLabel } OPTIONAL { ?level skos:notation ?notation } OPTIONAL { ?level lexnet:rank ?rank } OPTIONAL { ?level skos:inScheme ?scheme . OPTIONAL { ?scheme rdfs:label ?schemeLabel } } } ORDER BY ?scheme ?rank`,
      ),
      "level",
    ),
  ].map(([, rs]) => level(rs)!);
}
export async function concept(id: string): Promise<Concept> {
  const [details, ws, relations] = await Promise.all([
    meta(id),
    select(
      `SELECT DISTINCT ?entry ?form ?written ?phonetic ?pos ?posLabel ?sense ?level ?levelLabel ?notation ?scheme ?schemeLabel ?rank ?register ?registerLabel WHERE { ?entry ontolex:sense ?sense . ?sense ontolex:isLexicalizedSenseOf ${resource(id)} . ${wordFields} ${levelFields} } ORDER BY ?entry ?sense`,
    ),
    select(
      `SELECT DISTINCT ?kind ?predicate ?predicateLabel ?other ?label WHERE { VALUES ?origin { ${resource(id)} } { ?origin skos:broader ?other . BIND("Hypernyms" AS ?kind) BIND(skos:broader AS ?predicate) } UNION { ?other skos:broader ?origin . BIND("Hyponyms" AS ?kind) BIND(skos:broader AS ?predicate) } UNION { { ?origin lexnet:partMeronym ?other } UNION { ?other lexnet:partHolonym ?origin } BIND("Parts" AS ?kind) BIND(lexnet:partMeronym AS ?predicate) } UNION { { ?other lexnet:partMeronym ?origin } UNION { ?origin lexnet:partHolonym ?other } BIND("Part of" AS ?kind) BIND(lexnet:partHolonym AS ?predicate) } UNION { ?origin (lexnet:antonym|^lexnet:antonym) ?other . BIND("Antonyms" AS ?kind) BIND(lexnet:antonym AS ?predicate) } FILTER(?other!=?origin) OPTIONAL { ?other skos:prefLabel ?label } OPTIONAL { ?predicate rdfs:label ?predicateLabel } }`,
    ),
  ]);
  if (!details.length) throw new Error("Concept not found");
  const topicIds = objects(details, ns.lexnet + "inDomain").map((b) => b.value);
  return {
    ...entityMeta(id, details),
    definitions: literals(details, ns.skos + "definition"),
    topics: await Promise.all(
      topicIds.map(async (t) => entityMeta(t, await meta(t))),
    ),
    words: [...group(ws, "sense")].flatMap(([, rs]) => words(rs)),
    relations: [...group(relations, "kind")].flatMap(([kind, rs]) =>
      [...group(rs, "other")].map(([other, ors]) => ({
        ...entity(other, labels(ors)),
        kind,
        predicate: value(ors[0], "predicate"),
        predicateLabel: preferred(
          labels(ors, "predicateLabel"),
          value(ors[0], "predicate"),
        ),
      })),
    ),
    matches: [
      ...objects(details, ns.skos + "exactMatch").map((b) => ({
        iri: b.value,
        kind: "exactMatch",
      })),
      ...objects(details, ns.skos + "closeMatch").map((b) => ({
        iri: b.value,
        kind: "closeMatch",
      })),
    ],
  };
}
export async function entry(id: string): Promise<Entry> {
  const [ws, ss, cr, chars, details] = await Promise.all([
    select(
      `SELECT ?entry ?form ?written ?pos ?posLabel ?phonetic WHERE { VALUES ?entry { ${resource(id)} } ?entry a ontolex:LexicalEntry . ${wordFields} }`,
    ),
    select(
      `SELECT ?sense ?concept ?level ?levelLabel ?notation ?scheme ?schemeLabel ?rank ?register ?registerLabel ?exampleText WHERE { ${resource(id)} ontolex:sense ?sense . OPTIONAL { ?sense ontolex:isLexicalizedSenseOf ?concept } ${levelFields} OPTIONAL { ?sense lexnet:hasExample/rdfs:label ?exampleText } } ORDER BY ?sense`,
    ),
    select(confusablesQuery(id)),
    select(
      `SELECT ?character ?label ?definition WHERE { ${resource(id)} ontolex:canonicalForm/lexnet:hasCharacter ?character . OPTIONAL { ?character rdfs:label ?label } OPTIONAL { ?character skos:definition ?definition . FILTER(LANG(?definition)="en") } }`,
    ),
    meta(id),
  ]);
  const w = words(ws)[0];
  if (!w) throw new Error("Entry not found");
  const senses = await Promise.all(
    [...group(ss, "sense")].map(async ([sid, rs]) => {
      const cid = value(rs[0], "concept");
      const c = cid
        ? await concept(cid)
        : {
            ...entity(""),
            definitions: [],
            topics: [],
            words: [],
            relations: [],
            matches: [],
          };
      return {
        iri: sid,
        conceptIri: cid,
        labels: c.labels,
        definitions: c.definitions,
        level: level(rs),
        register: rs[0].register
          ? entity(value(rs[0], "register"), labels(rs, "registerLabel"))
          : undefined,
        examples: labels(rs, "exampleText"),
        concept: c,
      };
    }),
  );
  const allChars = [...group(chars, "character")].map(([c, rs]) => ({
    ...entity(c, labels(rs)),
    definitions: labels(rs, "definition"),
  }));
  return {
    ...w,
    senses,
    confusables: [...group(cr, "predicate")].flatMap(([p, rs]) =>
      words(rs).map((w) => ({
        ...w,
        predicate: p,
        predicateLabel: preferred(labels(rs, "predicateLabel"), p),
      })),
    ),
    characters: [...w.writtenRep].flatMap((ch) =>
      allChars.filter(
        (c) => c.labels.some((l) => l.value === ch) || c.label === ch,
      ),
    ),
    lexemes: objects(details, ns.owl + "sameAs").map((b) => b.value),
  };
}
export async function browse(params: {
  topic?: string;
  language?: string;
  scheme?: string;
  maxRank?: number;
  page: number;
  includeUnspecified?: boolean;
}) {
  const language = params.language || "auto";
  if (!["auto", "en", "vi", "zh"].includes(language))
    throw new Error("Unsupported language");
  const filters = `${params.topic ? `?concept lexnet:inDomain ${resource(params.topic)} .` : ""} ${language === "auto" ? "" : `FILTER(LANG(?written)=${literal(language)})`} ${params.scheme ? `OPTIONAL { ?sense lexnet:level ?filterLevel . ?filterLevel skos:inScheme ${resource(params.scheme)} ; lexnet:rank ?filterRank } FILTER(${params.includeUnspecified ? "!EXISTS { ?sense lexnet:level ?anyLevel } || " : ""}(BOUND(?filterLevel) ${params.maxRank ? `&& ?filterRank <= ${params.maxRank}` : ""}))` : ""}`;
  const pattern = `?entry ontolex:sense ?sense ; ontolex:canonicalForm/ontolex:writtenRep ?written . ?sense ontolex:isLexicalizedSenseOf ?concept . FILTER(LANG(?written) IN ("en","vi","zh")) ${filters}`;
  const [count, rs] = await Promise.all([
    select(
      `SELECT (COUNT(*) AS ?count) WHERE { { SELECT DISTINCT ?entry ?sense WHERE { ${pattern} } } }`,
    ),
    select(
      `SELECT ?entry ?sense ?concept ?form ?written ?phonetic ?pos ?posLabel ?level ?levelLabel ?notation ?scheme ?schemeLabel ?rank ?register ?registerLabel ?label WHERE { { SELECT DISTINCT ?entry ?sense ?concept WHERE { ${pattern} } ORDER BY ?entry ?sense LIMIT 24 OFFSET ${(params.page - 1) * 24} } ${wordFields} ${levelFields} OPTIONAL { ?concept skos:prefLabel ?label } } ORDER BY ?entry ?sense`,
    ),
  ]);
  return {
    total: Number(value(count[0], "count")),
    page: params.page,
    pageSize: 24,
    items: [...group(rs, "sense")].flatMap(([, ss]) =>
      words(ss).map((w) => ({
        ...w,
        concept: entity(value(ss[0], "concept"), labels(ss)),
      })),
    ),
    levelNote: params.scheme
      ? "Only matching sense levels are included; unspecified levels are excluded unless selected."
      : "Levels are recorded per sense; unspecified levels remain unspecified.",
  };
}
export async function character(id: string, page = 1): Promise<Character> {
  const details = await meta(id);
  if (!details.length) throw new Error("Character not found");
  const radicals = await Promise.all(
    objects(details, ns.lexnet + "hasRadical").map(async (b) => {
      const rs = await meta(b.value);
      return {
        ...entityMeta(b.value, rs),
        variants: objects(rs, ns.lexnet + "variantForm").map((b) => b.value),
        number:
          Number(objects(rs, ns.lexnet + "radicalNumber")[0]?.value) ||
          undefined,
        definitions: literals(rs, ns.skos + "definition"),
      };
    }),
  );
  const [similar, ws, peers] = await Promise.all([
    select(
      `SELECT DISTINCT ?character ?label WHERE { ${resource(id)} (lexnet:similarCharacter|^lexnet:similarCharacter) ?character . FILTER(?character!=${resource(id)}) OPTIONAL { ?character rdfs:label ?label } }`,
    ),
    select(
      `SELECT ?entry ?form ?written ?phonetic ?pos ?posLabel WHERE { { SELECT DISTINCT ?entry WHERE { ?entry ontolex:canonicalForm/lexnet:hasCharacter ${resource(id)} } ORDER BY ?entry LIMIT 25 OFFSET ${(page - 1) * 24} } ${wordFields} }`,
    ),
    select(
      `SELECT DISTINCT ?character ?label WHERE { ${resource(id)} lexnet:hasRadical ?radical . ?character lexnet:hasRadical ?radical . FILTER(?character!=${resource(id)}) OPTIONAL { ?character rdfs:label ?label } } ORDER BY ?character LIMIT 25 OFFSET ${(page - 1) * 24}`,
    ),
  ]);
  const wordList = words(ws);
  return {
    ...entityMeta(id, details),
    strokes:
      Number(objects(details, ns.lexnet + "strokeCount")[0]?.value) ||
      undefined,
    readings: unique(
      objects(details, ns.lexnet + "reading").map((b) => b.value),
    ),
    commonReadings: unique(
      objects(details, ns.lexnet + "commonReading").map((b) => b.value),
    ),
    definitions: literals(details, ns.skos + "definition"),
    radicals,
    similar: [...group(similar, "character")].map(([c, rs]) =>
      entity(c, labels(rs)),
    ),
    words: wordList.slice(0, 24),
    radicalPeers: [...group(peers, "character")]
      .slice(0, 24)
      .map(([c, rs]) => entity(c, labels(rs))),
    page,
    hasMore: wordList.length > 24 || group(peers, "character").size > 24,
  };
}
const coverage = (
  numerator: number,
  denominator: number,
  population: string,
): Coverage => ({
  numerator,
  denominator,
  ratio: denominator ? numerator / denominator : null,
  population,
});
export async function stats(): Promise<Stats> {
  const classes = {
    Concept: "lexnet:Concept",
    LexicalEntry: "ontolex:LexicalEntry",
    LexicalSense: "ontolex:LexicalSense",
    Form: "ontolex:Form",
    HanCharacter: "lexnet:HanCharacter",
    Radical: "lexnet:Radical",
    Topic: "lexnet:ThematicDomain",
  };
  const counts = Object.fromEntries(
    await Promise.all(
      Object.entries(classes).map(async ([k, c]) => [
        k,
        Number(
          value(
            (
              await select(
                `SELECT (COUNT(DISTINCT ?s) AS ?count) WHERE { ?s a ${c} }`,
              )
            )[0],
            "count",
          ),
        ),
      ]),
    ),
  );
  const languages = await Promise.all(
    ["en", "vi", "zh"].map(async (language) => {
      const root = `?entry a ontolex:LexicalEntry ; ontolex:canonicalForm/ontolex:writtenRep ?written . FILTER(LANG(?written)=${literal(language)})`;
      const count = async (field: string, extra = "") =>
        Number(
          value(
            (
              await select(
                `SELECT (COUNT(DISTINCT ?${field}) AS ?count) WHERE { ${root} ${extra} }`,
              )
            )[0],
            "count",
          ),
        );
      const [
        entries,
        senses,
        writtenForms,
        levelCount,
        examples,
        registers,
        lexemes,
      ] = await Promise.all([
        count("entry"),
        count("sense", "?entry ontolex:sense ?sense"),
        count("written"),
        count(
          "sense",
          "?entry ontolex:sense ?sense . ?sense lexnet:level ?level",
        ),
        count(
          "sense",
          "?entry ontolex:sense ?sense . ?sense lexnet:hasExample ?example",
        ),
        count(
          "sense",
          "?entry ontolex:sense ?sense . ?sense lexnet:register ?register",
        ),
        count("entry", "?entry owl:sameAs ?lexeme"),
      ]);
      return {
        language,
        entries,
        senses,
        writtenForms,
        levels: coverage(
          levelCount,
          senses,
          `${language} senses, any recorded level; frameworks are not pooled as missing CEFR/HSK`,
        ),
        examples: coverage(examples, senses, `${language} senses`),
        registers: coverage(registers, senses, `${language} senses`),
        lexemes: coverage(lexemes, entries, `${language} entries`),
      };
    }),
  );
  const ts = await topics();
  const topicStats = await Promise.all(
    ts.map(async (t) => {
      const r = (
        await select(
          `SELECT (COUNT(DISTINCT ?entry) AS ?entries) (COUNT(DISTINCT ?sense) AS ?senses) WHERE { ?concept lexnet:inDomain ${resource(t.iri)} . ?sense ontolex:isLexicalizedSenseOf ?concept . ?entry ontolex:sense ?sense }`,
        )
      )[0];
      return {
        ...t,
        entries: Number(value(r, "entries")),
        senses: Number(value(r, "senses")),
      };
    }),
  );
  const matches = Object.fromEntries(
    await Promise.all(
      ["exactMatch", "closeMatch", "either"].map(async (k) => {
        const n = Number(
          value(
            (
              await select(
                `SELECT (COUNT(DISTINCT ?concept) AS ?count) WHERE { ?concept a lexnet:Concept ; ${k === "either" ? "(skos:exactMatch|skos:closeMatch)" : `skos:${k}`} ?item }`,
              )
            )[0],
            "count",
          ),
        );
        return [k, coverage(n, counts.Concept, "LexNet concepts")];
      }),
    ),
  );
  return { counts, languages, topics: topicStats, matches };
}
const graphPredicates = [
  "ontolex:sense",
  "ontolex:isLexicalizedSenseOf",
  "ontolex:canonicalForm",
  "ontolex:evokes",
  "lexinfo:partOfSpeech",
  "lexnet:inDomain",
  "lexnet:level",
  "lexnet:register",
  "lexnet:hasExample",
  "lexnet:hasCharacter",
  "lexnet:hasRadical",
  "lexnet:similarCharacter",
  "lexnet:similarGlyph",
  "lexnet:similarMeaning",
  "lexnet:similarSound",
  "lexnet:antonym",
  "lexnet:partMeronym",
  "lexnet:partHolonym",
  "skos:broader",
];
export async function graph(
  id: string,
  depth = 1,
  nodeLimit = config.graphNodes,
  edgeLimit = config.graphEdges,
): Promise<Graph> {
  resource(id);
  const nodes = new Map<string, Graph["nodes"][number]>();
  const edges = new Map<string, Graph["edges"][number]>();
  const senseIds = new Set<string>();
  let frontier = [id];
  let truncated = false;
  const addNode = (
    id: string,
    rs: Row[],
    labelKey: string,
    typeKey: string,
  ) => {
    if (nodes.has(id)) return true;
    if (nodes.size >= nodeLimit) {
      truncated = true;
      return false;
    }
    nodes.set(id, {
      id,
      iri: id,
      expandable: id.startsWith(config.base) || id.startsWith(config.schema),
      label: preferred(labels(rs, labelKey), id),
      type: preferred(
        labels(rs, typeKey + "Label"),
        value(rs[0], typeKey) || "Resource",
      ),
    });
    if (rs.some((r) => value(r, typeKey) === ns.ontolex + "LexicalSense"))
      senseIds.add(id);
    return true;
  };
  const root = await select(
    `SELECT ?label ?type ?typeLabel WHERE { VALUES ?s { ${resource(id)} } OPTIONAL { ?s (skos:prefLabel|rdfs:label|ontolex:writtenRep|ontolex:canonicalForm/ontolex:writtenRep) ?label } OPTIONAL { ?s a ?type . OPTIONAL { ?type rdfs:label ?typeLabel } } }`,
  );
  addNode(id, root, "label", "type");
  for (let step = 0; step < depth && frontier.length; step++) {
    const rs = await select(
      `SELECT DISTINCT ?source ?predicate ?target ?sourceLabel ?targetLabel ?sourceType ?sourceTypeLabel ?targetType ?targetTypeLabel ?predicateLabel WHERE { VALUES ?focus { ${frontier.map(resource).join(" ")} } VALUES ?predicate { ${graphPredicates.join(" ")} } { ?focus ?predicate ?target . BIND(?focus AS ?source) } UNION { ?source ?predicate ?focus . BIND(?focus AS ?target) } FILTER(isIRI(?source)&&isIRI(?target)) OPTIONAL { ?source (skos:prefLabel|rdfs:label|ontolex:writtenRep|ontolex:canonicalForm/ontolex:writtenRep) ?sourceLabel } OPTIONAL { ?target (skos:prefLabel|rdfs:label|ontolex:writtenRep|ontolex:canonicalForm/ontolex:writtenRep) ?targetLabel } OPTIONAL { ?source a ?sourceType . OPTIONAL { ?sourceType rdfs:label ?sourceTypeLabel } } OPTIONAL { ?target a ?targetType . OPTIONAL { ?targetType rdfs:label ?targetTypeLabel } } OPTIONAL { ?predicate rdfs:label ?predicateLabel } } LIMIT ${edgeLimit * 30 + 1}`,
    );
    if (rs.length >= edgeLimit * 30 + 1) truncated = true;
    const next = new Set<string>();
    for (const [, es] of group(
      rs.map((r) => ({
        ...r,
        key: {
          type: "literal" as const,
          value: JSON.stringify([
            value(r, "source"),
            value(r, "predicate"),
            value(r, "target"),
          ]),
        },
      })),
      "key",
    )) {
      const r = es[0],
        s = value(r, "source"),
        t = value(r, "target"),
        p = value(r, "predicate"),
        key = JSON.stringify([s, p, t]);
      if (edges.has(key)) continue;
      if (edges.size >= edgeLimit) {
        truncated = true;
        break;
      }
      if (
        (!nodes.has(s) && nodes.size >= nodeLimit) ||
        (!nodes.has(t) && nodes.size + (nodes.has(s) ? 0 : 1) >= nodeLimit)
      ) {
        truncated = true;
        continue;
      }
      for (const [i, l, ty] of [
        [s, "sourceLabel", "sourceType"],
        [t, "targetLabel", "targetType"],
      ]) {
        if (!nodes.has(i)) next.add(i);
        addNode(i, es, l, ty);
      }
      edges.set(key, {
        id: key,
        source: s,
        target: t,
        predicate: p,
        label: preferred(labels(es, "predicateLabel"), p),
        provenance: "Asserted",
      });
    }
    frontier = [...next].filter((i) => i.startsWith(config.base));
  }
  if (senseIds.size) {
    const senseRows = await select(
      `SELECT ?sense ?written ?definition ?conceptLabel WHERE { VALUES ?sense { ${[...senseIds].map(resource).join(" ")} } OPTIONAL { ?entry ontolex:sense ?sense ; ontolex:canonicalForm/ontolex:writtenRep ?written } OPTIONAL { ?sense ontolex:isLexicalizedSenseOf ?concept . OPTIONAL { ?concept skos:definition ?definition . FILTER(LANG(?definition)="en") } OPTIONAL { ?concept skos:prefLabel ?conceptLabel } } }`,
    );
    for (const [sid, rs] of group(senseRows, "sense")) {
      const node = nodes.get(sid)!;
      const word = preferred(labels(rs, "written"), "");
      const meaning =
        value(rs.find((r) => r.definition) || {}, "definition") ||
        preferred(labels(rs, "conceptLabel"), "");
      node.label = [word, meaning].filter(Boolean).join(" · ") || node.label;
    }
  }
  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    truncated,
    limits: { nodes: nodeLimit, edges: edgeLimit },
  };
}
export { localName };
