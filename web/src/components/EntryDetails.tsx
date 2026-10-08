"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type {
  AudioResult,
  Character,
  Concept,
  Entry,
  Sense,
} from "@/lib/types";
import {
  EntityLink,
  ErrorBox,
  Literals,
  Loading,
  WordLink,
  WordList,
  languageName,
  route,
  useRemote,
} from "./common";
function Audio({ id, revision }: { id: string; revision: number }) {
  const result = useRemote<AudioResult>(
    `/api/audio?${new URLSearchParams({ iri: id })}`,
    revision,
  );
  const [error, setError] = useState("");
  const playable = result.data?.candidates.filter(
    (c) =>
      typeof document !== "undefined" &&
      (!c.mime || document.createElement("audio").canPlayType(c.mime)),
  );
  return (
    <div className="audio-section">
      {result.loading && (
        <span className="muted">Checking pronunciation audio…</span>
      )}
      {(result.error || result.data?.status === "error") && (
        <span className="muted">External audio lookup unavailable.</span>
      )}
      {playable?.map((c) => (
        <div key={c.url}>
          <audio
            controls
            preload="none"
            src={c.url}
            onError={() =>
              setError("Audio could not be loaded or played in this browser.")
            }
            aria-label={`Pronunciation of ${c.representation}`}
          />
          <a href={c.source} target="_blank" rel="noreferrer">
            Audio source: Wikidata ↗
          </a>
        </div>
      ))}
      {error && <p role="alert">{error}</p>}
      {result.data?.status === "unavailable" && (
        <span className="muted">{result.data.message}</span>
      )}
      {result.data?.status === "available" && !playable?.length && (
        <span className="muted">
          Audio exists, but its format is unsupported in this browser.
        </span>
      )}
    </div>
  );
}
export function ConceptContent({ concept: c }: { concept: Concept }) {
  return (
    <>
      <div className="concept-labels">
        <Literals values={c.labels} />
      </div>
      {c.definitions.length > 0 && (
        <div className="definitions">
          <Literals values={c.definitions} />
        </div>
      )}
      <h4>Translations &amp; synonyms</h4>
      <WordList words={c.words} />
      {c.topics.length > 0 && (
        <div className="topic-line">
          <span className="muted">Topics</span>
          {c.topics.map((t) => (
            <Link
              className="badge"
              key={t.iri}
              href={`/topics?${new URLSearchParams({ topic: t.iri })}`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      )}
      {c.relations.length > 0 && (
        <div className="relationships">
          {["Hypernyms", "Hyponyms", "Parts", "Part of", "Antonyms"]
            .filter((kind) => c.relations.some((r) => r.kind === kind))
            .map((kind) => (
              <div key={kind}>
                <h4>{kind}</h4>
                <div className="chips">
                  {c.relations
                    .filter((r) => r.kind === kind)
                    .map((r) => (
                      <EntityLink key={r.iri} entity={r} />
                    ))}
                </div>
              </div>
            ))}
        </div>
      )}
      <details className="technical-details">
        <summary>Source details</summary>
        <code>{c.iri}</code>
        {c.matches.map((m) => (
          <p key={m.iri + m.kind}>
            <strong>
              {m.kind === "exactMatch" ? "Exact match" : "Close match"}
            </strong>{" "}
            ·{" "}
            <a href={m.iri} target="_blank" rel="noreferrer">
              {m.iri}
            </a>
          </p>
        ))}
        <Link href={route("developer", c.iri) + "&tab=graph"}>
          Explore in graph →
        </Link>
      </details>
    </>
  );
}
function SenseCard({ sense: s, index }: { sense: Sense; index: number }) {
  return (
    <article className="sense-card">
      <div className="sense-heading">
        <span className="sense-number">
          {String(index + 1).padStart(2, "0")}
        </span>
        <h2>{s.concept.label || "Concept not recorded"}</h2>
        <div className="chips">
          {s.level ? (
            <span className="badge green">{s.level.label}</span>
          ) : (
            <span className="badge">Level not recorded</span>
          )}
          {s.register && (
            <span className="badge amber">{s.register.label}</span>
          )}
        </div>
      </div>
      <ConceptContent concept={s.concept} />
      {s.examples.length > 0 && (
        <div className="examples">
          <h4>Examples</h4>
          {s.examples.map((e, i) => (
            <blockquote key={i} lang={e.language}>
              {e.value}
            </blockquote>
          ))}
        </div>
      )}
    </article>
  );
}
export function CharacterDetails({
  id,
  close,
}: {
  id: string;
  close?: () => void;
}) {
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const result = useRemote<Character>(
    `/api/character?${new URLSearchParams({ iri: id, page: String(page) })}`,
    revision,
  );
  const c = result.data;
  return (
    <section className="character-panel" aria-label="Character details">
      <div className="section-heading">
        <h2>Han character</h2>
        {close && (
          <button className="button secondary" onClick={close}>
            Close
          </button>
        )}
      </div>
      {result.loading && <Loading />}
      {result.error && (
        <ErrorBox
          error={result.error}
          retry={() => setRevision((r) => r + 1)}
        />
      )}{" "}
      {c && (
        <>
          <div className="character-title">
            <strong lang="zh">{c.label}</strong>
            <div>
              <p>
                {c.strokes
                  ? `${c.strokes} strokes`
                  : "Stroke count not recorded"}
              </p>
              <Literals values={c.definitions} />
            </div>
          </div>
          <h4>All recorded readings</h4>
          <div className="chips">
            {c.readings.map((r) => (
              <span className="badge" key={r}>
                {r}
              </span>
            ))}
          </div>
          <p className="muted">
            Common reading: {c.commonReadings.join(" · ") || "Not recorded"} · A
            character reading can vary by word.
          </p>
          <h4>Radicals</h4>
          {c.radicals.map((r) => (
            <div className="radical" key={r.iri}>
              <strong>{r.label}</strong>
              <span>
                Radical #{r.number ?? "unspecified"}
                {r.variants.length
                  ? ` · Variants: ${r.variants.join(" · ")}`
                  : ""}
              </span>
              <Literals values={r.definitions} />
            </div>
          ))}
          <h4>Similar characters</h4>
          <div className="chips">
            {c.similar.length ? (
              c.similar.map((s) => (
                <Link
                  key={s.iri}
                  className="word-chip"
                  href={route("character", s.iri)}
                >
                  {s.label}
                </Link>
              ))
            ) : (
              <span className="muted">None recorded</span>
            )}
          </div>
          <h4>Words containing {c.label}</h4>
          <div className="chips">
            {c.words.map((w) => (
              <WordLink key={w.iri} word={w} />
            ))}
          </div>
          <h4>Characters sharing a radical</h4>
          <div className="chips">
            {c.radicalPeers.map((s) => (
              <Link
                className="word-chip"
                key={s.iri}
                href={route("character", s.iri)}
              >
                {s.label}
              </Link>
            ))}
          </div>
          <div className="pagination">
            <button
              className="button secondary"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span>Page {page}</span>
            <button
              className="button secondary"
              disabled={!c.hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}
export default function EntryDetails({
  mode = "entry",
}: {
  mode?: "entry" | "concept" | "character";
}) {
  const params = useSearchParams();
  const id = params.get("iri");
  const [revision, setRevision] = useState(0);
  const [selectedChar, setSelectedChar] = useState<string | null>(null);
  const result = useRemote<Entry | Concept>(
    id && mode !== "character"
      ? `/api/${mode}?${new URLSearchParams({ iri: id })}`
      : null,
    revision,
  );
  if (!id)
    return (
      <div className="page">
        <ErrorBox error="Choose a word or concept from search results." />
      </div>
    );
  if (mode === "character")
    return (
      <div className="page">
        <CharacterDetails key={id} id={id} />
      </div>
    );
  const data = result.data;
  const e = mode === "entry" ? (data as Entry) : undefined;
  return (
    <div className="page detail-page">
      <Link href="/" className="back-link">
        ← Back to dictionary
      </Link>
      {result.loading && <Loading />}
      {result.error && (
        <ErrorBox
          error={result.error}
          retry={() => setRevision((r) => r + 1)}
        />
      )}
      {data && (
        <>
          <div className="entry-title">
            <div>
              <div className="eyebrow">
                {e ? languageName(e.language) : "SHARED CONCEPT"}
              </div>
              <h1 lang={e?.language}>
                {e ? e.writtenRep : (data as Concept).label}
              </h1>
              {e && (
                <div className="entry-meta">
                  <span>{e.pos.map((p) => p.label).join(", ")}</span>
                  <span>{e.phonetics.map((p) => p.value).join(" · ")}</span>
                  {e.senses.length > 1 && (
                    <span className="badge green">
                      Multiple senses · {e.senses.length}
                    </span>
                  )}
                </div>
              )}
            </div>
            <button
              className="button secondary"
              onClick={() => setRevision((r) => r + 1)}
            >
              ↻ Refresh data
            </button>
          </div>
          {e ? (
            <>
              <Audio
                key={e.iri + "|" + revision}
                id={e.iri}
                revision={revision}
              />
              <div className="sense-stack">
                {e.senses.map((s, i) => (
                  <SenseCard key={s.iri} sense={s} index={i} />
                ))}
              </div>
              {e.confusables.length > 0 && (
                <section className="panel">
                  <h2>Words to tell apart</h2>
                  <p className="muted">
                    Connections recorded in the source, in either direction.
                  </p>
                  {[...new Set(e.confusables.map((c) => c.predicate))].map(
                    (p) => (
                      <div className="confusable-group" key={p}>
                        <h4>
                          {(
                            {
                              similarGlyph: "Similar spelling",
                              similarMeaning: "Similar meaning / usage",
                              similarSound: "Same pronunciation",
                            } as Record<string, string>
                          )[p.split("#").pop()!] ||
                            e.confusables.find((c) => c.predicate === p)
                              ?.predicateLabel}
                        </h4>
                        <div className="chips">
                          {e.confusables
                            .filter((c) => c.predicate === p)
                            .map((c) => (
                              <WordLink key={c.iri} word={c} />
                            ))}
                        </div>
                      </div>
                    ),
                  )}
                </section>
              )}
              {e.characters.length > 0 && (
                <section className="panel">
                  <h2>Explore the characters</h2>
                  <p className="muted">
                    In word order · Word pinyin appears above; character
                    readings appear in details.
                  </p>
                  <div className="character-buttons">
                    {e.characters.map((c, i) => (
                      <button
                        key={`${c.iri}-${i}`}
                        onClick={() => setSelectedChar(c.iri)}
                      >
                        <strong lang="zh">{c.label}</strong>
                        <small>Character {i + 1} ↗</small>
                      </button>
                    ))}
                  </div>
                  {selectedChar && (
                    <CharacterDetails
                      key={selectedChar}
                      id={selectedChar}
                      close={() => setSelectedChar(null)}
                    />
                  )}
                </section>
              )}
            </>
          ) : (
            <section className="sense-card">
              <ConceptContent concept={data as Concept} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
