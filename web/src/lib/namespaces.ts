export const config = {
  endpoint: process.env.SPARQL_ENDPOINT || "http://localhost:3030/lexnet/query",
  base:
    process.env.LEXNET_RESOURCE_BASE ||
    "https://nov17th.github.io/lexnet/build/lexnet-full.ttl#",
  schema:
    process.env.LEXNET_SCHEMA_IRI ||
    "https://nov17th.github.io/lexnet/ontology/lexnet-ontology.ttl#",
  timeout: Number(process.env.SPARQL_TIMEOUT_MS || 10000),
  resultLimit: Number(process.env.SPARQL_RESULT_LIMIT || 300),
  graphNodes: Number(process.env.GRAPH_NODE_LIMIT || 80),
  graphEdges: Number(process.env.GRAPH_EDGE_LIMIT || 150),
};
export const ns = {
  lexnet: config.schema,
  ontolex: "http://www.w3.org/ns/lemon/ontolex#",
  lexinfo: "http://www.lexinfo.net/ontology/3.0/lexinfo#",
  skos: "http://www.w3.org/2004/02/skos/core#",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  owl: "http://www.w3.org/2002/07/owl#",
};
/** Prefixes the SPARQL console adds when a query uses them without declaring them, as in queries/queries.rq. */
export const consolePrefixes: Record<string, string> = {
  ...ns,
  xsd: "http://www.w3.org/2001/XMLSchema#",
  dct: "http://purl.org/dc/terms/",
  wd: "http://www.wikidata.org/entity/",
  wdt: "http://www.wikidata.org/prop/direct/",
  concept: config.base + "concept/",
  entry: config.base + "entry/",
  sense: config.base + "sense/",
  form: config.base + "form/",
  char: config.base + "char/",
  topic: config.base + "topic/",
  radical: config.base + "radical/",
  level: config.schema + "level/",
};
export function withPrefixes(query: string) {
  const declared = new Set(
    [...query.matchAll(/PREFIX\s+([A-Za-z][\w-]*)?\s*:/giu)].map(
      (m) => m[1] || "",
    ),
  );
  const missing = Object.entries(consolePrefixes).filter(
    ([name]) =>
      !declared.has(name) &&
      new RegExp(`(^|[\\s(/^|,;{}!])${name}:`, "mu").test(query),
  );
  return missing.length
    ? missing.map(([k, v]) => `PREFIX ${k}: <${v}>`).join("\n") + "\n" + query
    : query;
}
export const prefixes = Object.entries(ns)
  .map(([k, v]) => `PREFIX ${k}: <${v}>`)
  .join("\n");
export function localName(iri: string) {
  return decodeURIComponent(iri.split(/[/#]/).pop() || iri).replaceAll(
    "_",
    " ",
  );
}
export function literal(value: string) {
  return JSON.stringify(value.normalize("NFC").trim());
}
export function iri(value: string) {
  if (!/^https?:\/\//u.test(value) || /[<>"{}|^`\\\u0000-\u0020]/u.test(value))
    throw new Error("Invalid resource IRI");
  new URL(value);
  return `<${value}>`;
}
export function resource(value: string) {
  if (!value.startsWith(config.base) && !value.startsWith(config.schema))
    throw new Error("Resource must belong to the configured LexNet namespace");
  return iri(value);
}
export function integer(
  value: string | null | undefined,
  fallback: number,
  max: number,
  min = 1,
) {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(`Expected an integer between ${min} and ${max}`);
  return n;
}
