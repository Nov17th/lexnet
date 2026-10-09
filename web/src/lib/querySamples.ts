import { readFile } from "node:fs/promises";
import type { QuerySample } from "./types";

export function parseQuerySamples(source: string): QuerySample[] {
  const headings = [
    ...source.matchAll(/^#[ \t]*---[ \t]*(\d+)\)[ \t]*(.+)$/gm),
  ];
  const preamble = source.slice(0, headings[0]?.index || 0).trim();
  return headings.map((heading, index) => {
    const body = source
      .slice(heading.index! + heading[0].length, headings[index + 1]?.index)
      .trim();
    return {
      id: `demo-${heading[1]}`,
      title: `${heading[1]}) ${heading[2].trim()}`,
      query: [preamble, body].filter(Boolean).join("\n\n"),
      federated: /^\s*SERVICE\b|\bSERVICE\s+(?:SILENT\s+)?[<?]/imu.test(body),
    };
  });
}

export async function querySamples(): Promise<QuerySample[]> {
  const file = process.env.LEXNET_QUERIES_FILE || "../queries/queries.rq";
  try {
    // The repository supplies this file at runtime, outside the web bundle.
    return parseQuerySamples(
      await readFile(/* turbopackIgnore: true */ file, "utf8"),
    );
  } catch {
    throw new Error(
      "Cannot read demo queries. Check LEXNET_QUERIES_FILE and the repository queries/queries.rq file.",
    );
  }
}
