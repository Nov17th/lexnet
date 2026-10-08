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
    const extension = audioUrl.pathname.split(".").pop()?.toLowerCase();
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
    if (!result.some((c) => c.url === audioUrl.href))
      result.push({
        url: audioUrl.href,
        mime,
        representation: rep,
        source: r.lexeme.value,
      });
  }
  return result;
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
      const query = `PREFIX ontolex: <http://www.w3.org/ns/lemon/ontolex#> PREFIX wdt: <http://www.wikidata.org/prop/direct/> SELECT DISTINCT ?lexeme ?representation ?audio WHERE { VALUES ?lexeme { ${lexemes.map((l) => `<${l.replace("https:", "http:")}>`).join(" ")} } ?lexeme ontolex:lexicalForm ?form . ?form ontolex:representation ?representation ; wdt:P443 ?audio . FILTER(LANG(?representation)=${literal(e.language)}) }`;
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
