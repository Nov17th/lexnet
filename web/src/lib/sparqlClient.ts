import { Parser } from "sparqljs";
import { Parser as RdfParser } from "n3";
import { config, prefixes } from "./namespaces";
import type { Binding, QueryResult, Row } from "./types";
export class UpstreamError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
export function parseReadQuery(query: string) {
  if (query.length > 50000) throw new Error("Query exceeds 50,000 characters");
  const ast = new Parser().parse(query);
  if (ast.type !== "query")
    throw new Error(
      "Only read queries are allowed. SPARQL Update is disabled.",
    );
  return ast;
}
export async function upstream(
  query: string,
  accept = "application/sparql-results+json",
  signal?: AbortSignal,
) {
  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: accept,
      },
      body: new URLSearchParams({ query }),
      cache: "no-store",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(config.timeout)])
        : AbortSignal.timeout(config.timeout),
    });
    if (!response.ok)
      throw new UpstreamError(
        `SPARQL endpoint returned ${response.status}: ${(await response.text()).slice(0, 900)}`,
      );
    return response;
  } catch (e) {
    if (e instanceof UpstreamError) throw e;
    throw new UpstreamError(
      `Cannot reach SPARQL endpoint. Start Fuseki and retry. ${e instanceof Error ? e.message : ""}`,
    );
  }
}
export async function select(
  body: string,
  signal?: AbortSignal,
): Promise<Row[]> {
  const r = await upstream(
    `${prefixes}\n${body}`,
    "application/sparql-results+json",
    signal,
  );
  return (await r.json()).results.bindings;
}
export async function consoleQuery(
  query: string,
  signal?: AbortSignal,
): Promise<QueryResult> {
  const ast = parseReadQuery(query);
  const kind = ast.queryType;
  if (kind !== "ASK") {
    const bounded = ast as typeof ast & { limit?: number };
    bounded.limit = Math.min(
      bounded.limit ?? config.resultLimit + 1,
      config.resultLimit + 1,
    );
  }
  if (kind === "SELECT") {
    const { Generator } = await import("sparqljs");
    const json = await (
      await upstream(
        new Generator().stringify(ast),
        "application/sparql-results+json",
        signal,
      )
    ).json();
    return {
      kind,
      variables: json.head.vars,
      rows: json.results.bindings.slice(0, config.resultLimit),
      truncated: json.results.bindings.length > config.resultLimit,
    };
  }
  if (kind === "ASK")
    return {
      kind,
      boolean: (await (await upstream(query, undefined, signal)).json())
        .boolean,
    };
  const { Generator } = await import("sparqljs");
  const text = await (
    await upstream(new Generator().stringify(ast), "text/turtle", signal)
  ).text();
  const quads = new RdfParser().parse(text);
  const binding = (
    t: (typeof quads)[number]["subject"] | (typeof quads)[number]["object"],
  ): Binding => ({
    type:
      t.termType === "NamedNode"
        ? "uri"
        : t.termType === "BlankNode"
          ? "bnode"
          : "literal",
    value: t.value,
    ...(t.termType === "Literal"
      ? { "xml:lang": t.language, datatype: t.datatype.value }
      : {}),
  });
  return {
    kind,
    triples: quads.slice(0, config.resultLimit).map((q) => ({
      subject: binding(q.subject),
      predicate: binding(q.predicate),
      object: binding(q.object),
    })),
    truncated: quads.length > config.resultLimit,
  };
}
