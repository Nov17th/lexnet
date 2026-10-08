import { NextRequest, NextResponse } from "next/server";
import * as repo from "@/lib/repositories";
import { integer, config, prefixes } from "@/lib/namespaces";
import { consoleQuery, upstream, UpstreamError } from "@/lib/sparqlClient";
import { audio } from "@/lib/wikidataClient";
import {
  polysemyQuery,
  sharedQuery,
  confusablesQuery,
} from "@/lib/queryBuilders";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const response = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
function failure(e: unknown) {
  return response(
    { error: e instanceof Error ? e.message : "Unexpected error" },
    e instanceof UpstreamError
      ? e.status
      : e instanceof Error && e.message.includes("not found")
        ? 404
        : 400,
  );
}
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ action: string }> },
) {
  const { action } = await context.params;
  const p = request.nextUrl.searchParams;
  const id = () => {
    const id = p.get("iri");
    if (!id) throw new Error("Resource IRI is required");
    return id;
  };
  try {
    switch (action) {
      case "health": {
        const start = Date.now();
        await upstream("ASK { ?s ?p ?o }", undefined, request.signal);
        return response({ connected: true, elapsedMs: Date.now() - start });
      }
      case "search": {
        const q = (p.get("q") || "").normalize("NFC").trim();
        if (q.length > 150) throw new Error("Search input is too long");
        return response({
          entries: q
            ? await repo.search(
                q,
                p.get("language") || "auto",
                integer(p.get("limit"), 20, 60),
              )
            : [],
        });
      }
      case "entry":
        return response(await repo.entry(id()));
      case "concept":
        return response(await repo.concept(id()));
      case "topics":
        return response(await repo.topics());
      case "levels":
        return response(
          (await repo.levels()).filter(
            (l) => !p.get("framework") || l.scheme === p.get("framework"),
          ),
        );
      case "browse":
        return response(
          await repo.browse({
            topic: p.get("topic") || undefined,
            language: p.get("language") || "auto",
            scheme: p.get("scheme") || undefined,
            maxRank: p.has("maxRank")
              ? integer(p.get("maxRank"), 1, 100)
              : undefined,
            page: integer(p.get("page"), 1, 10000),
            includeUnspecified: p.get("includeUnspecified") === "true",
          }),
        );
      case "character": {
        let charId = p.get("iri");
        if (!charId && p.get("character")) {
          const { select } = await import("@/lib/sparqlClient");
          const { literal } = await import("@/lib/namespaces");
          const rows = await select(
            `SELECT ?character WHERE { ?character a lexnet:HanCharacter ; rdfs:label ?label . FILTER(STR(?label)=${literal(p.get("character")!)}) } LIMIT 1`,
          );
          charId = rows[0]?.character.value;
        }
        if (!charId) throw new Error("Character not found");
        return response(
          await repo.character(charId, integer(p.get("page"), 1, 10000)),
        );
      }
      case "stats":
        return response(await repo.stats());
      case "graph":
        return response(
          await repo.graph(
            id(),
            integer(p.get("depth"), 1, 3),
            integer(p.get("nodes"), config.graphNodes, config.graphNodes),
            integer(p.get("edges"), config.graphEdges, config.graphEdges),
          ),
        );
      case "audio":
        return response(await audio(id()));
      case "derived":
        return response(
          await consoleQuery(
            prefixes +
              "\n" +
              (p.get("kind") === "shared"
                ? sharedQuery(id())
                : p.get("kind") === "confusables"
                  ? confusablesQuery(id())
                  : polysemyQuery),
            request.signal,
          ),
        );
      default:
        return response({ error: "Unknown API route" }, 404);
    }
  } catch (e) {
    return failure(e);
  }
}
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ action: string }> },
) {
  if ((await context.params).action !== "sparql")
    return response({ error: "Method not allowed" }, 405);
  try {
    const raw = await request.text();
    if (raw.length > 60000) throw new Error("Request too large");
    const body = JSON.parse(raw);
    if (
      typeof body.query !== "string" ||
      Object.keys(body).some((k) => k !== "query")
    )
      throw new Error("Expected only a query string");
    const started = Date.now();
    return response({
      result: await consoleQuery(body.query, request.signal),
      elapsedMs: Date.now() - started,
    });
  } catch (e) {
    return failure(e);
  }
}
