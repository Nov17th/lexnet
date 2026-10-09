import { entry } from "./repositories";
import { literal } from "./namespaces";
import type { AudioResult, Row } from "./types";
const cache = new Map<string, { expires: number; result: AudioResult }>();
const pending = new Map<string, Promise<AudioResult>>();
export function selectAudioCandidates(
  rows: Row[],
  written: string,
  language: string,
): AudioResult["candidates"] {
  const result: AudioResult["candidates"] = [];
  for (const r of rows) {
    if (!r.representation || !r.audio || !r.lexeme) continue;
    const rep = r.representation.value.normalize("NFC");
    if (
      (language === "en" ? rep.toLowerCase() : rep) !==
      (language === "en" ? written.toLowerCase() : written)
    )
      continue;
    if (r.representation["xml:lang"] !== language) continue;
    let audioUrl: URL;
    try {
      audioUrl = new URL(r.audio.value);
    } catch {
      continue;
    }
    if (!["http:", "https:"].includes(audioUrl.protocol)) continue;
    if (
      !["commons.wikimedia.org", "upload.wikimedia.org"].includes(
        audioUrl.hostname,
      )
    )
      continue;
    let filename = audioUrl.pathname.split("/").pop() || "Audio recording";
    try {
      filename = decodeURIComponent(filename);
    } catch {}
    const extension = filename.split(".").pop()?.toLowerCase();
    const mime =
      (
        {
          ogg: "audio/ogg",
          oga: "audio/ogg",
          wav: "audio/wav",
          mp3: "audio/mpeg",
          flac: "audio/flac",
          webm: "audio/webm",
          opus: "audio/ogg",
        } as Record<string, string>
      )[extension || ""] || "";
    audioUrl.protocol = "https:";
    const label = r.varietyLabel?.value || filename;
    const existing = result.find((c) => c.url === audioUrl.href);
    if (existing && r.varietyLabel) {
      existing.label =
        existing.label === existing.filename
          ? label
          : [...new Set([...existing.label.split(" · "), label])].join(" · ");
    }
    if (!existing)
      result.push({
        url: audioUrl.href,
        mime,
        representation: rep,
        source: r.lexeme.value,
        label,
        filename,
      });
  }
  const priority = (label: string) =>
    /\b(?:American English|General American)\b/iu.test(label) ? 0 : 1;
  return result.sort(
    (a, b) =>
      priority(a.label) - priority(b.label) || a.label.localeCompare(b.label),
  );
}
export async function audio(id: string): Promise<AudioResult> {
  if (process.env.WIKIDATA_ENABLED === "false")
    return {
      status: "disabled",
      candidates: [],
      message: "External audio lookup is disabled.",
    };
  const e = await entry(id);
  const lexemes = e.lexemes.filter((l) =>
    /^https?:\/\/www\.wikidata\.org\/entity\/L\d+$/u.test(l),
  );
  if (!lexemes.length)
    return {
      status: "unavailable",
      candidates: [],
      message: "No Wikidata lexeme link in the source.",
    };
  const key = JSON.stringify([lexemes.sort(), e.writtenRep, e.language]);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.result;
  if (pending.has(key)) return pending.get(key)!;
  const request = (async () => {
    let result: AudioResult;
    try {
      const query = `PREFIX ontolex: <http://www.w3.org/ns/lemon/ontolex#> PREFIX p: <http://www.wikidata.org/prop/> PREFIX ps: <http://www.wikidata.org/prop/statement/> PREFIX pq: <http://www.wikidata.org/prop/qualifier/> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> PREFIX wikibase: <http://wikiba.se/ontology#> SELECT DISTINCT ?lexeme ?representation ?audio ?varietyLabel WHERE { VALUES ?lexeme { ${lexemes.map((l) => `<${l.replace("https:", "http:")}>`).join(" ")} } ?lexeme ontolex:lexicalForm ?form . ?form ontolex:representation ?representation ; p:P443 ?statement . ?statement ps:P443 ?audio . FILTER NOT EXISTS { ?statement wikibase:rank wikibase:DeprecatedRank } OPTIONAL { ?statement pq:P5237 ?variety . ?variety rdfs:label ?varietyLabel . FILTER(LANG(?varietyLabel)="en") } FILTER(LANG(?representation)=${literal(e.language)}) }`;
      const response = await fetch(
        process.env.WIKIDATA_ENDPOINT || "https://query.wikidata.org/sparql",
        {
          method: "POST",
          headers: {
            Accept: "application/sparql-results+json",
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "LexNet-Local-Demo/1.0",
          },
          body: new URLSearchParams({ query }),
          cache: "no-store",
          signal: AbortSignal.timeout(
            Number(process.env.WIKIDATA_TIMEOUT_MS || 8000),
          ),
        },
      );
      if (!response.ok) throw new Error(`Wikidata returned ${response.status}`);
      const candidates = selectAudioCandidates(
        (await response.json()).results.bindings,
        e.writtenRep,
        e.language,
      );
      result = {
        status: candidates.length ? "available" : "unavailable",
        candidates,
        message: candidates.length
          ? undefined
          : "No audio found for this exact written form.",
      };
    } catch (err) {
      result = {
        status: "error",
        candidates: [],
        message: `External lookup unavailable: ${err instanceof Error ? err.message : "request failed"}`,
      };
    }
    cache.set(key, {
      result,
      expires:
        Date.now() +
        (result.status === "error"
          ? 30000
          : Number(process.env.WIKIDATA_CACHE_TTL_MS || 3600000)),
    });
    return result;
  })();
  pending.set(key, request);
  try {
    return await request;
  } finally {
    pending.delete(key);
  }
}
