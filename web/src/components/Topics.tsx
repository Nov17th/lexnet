"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Entity, Level, Word } from "@/lib/types";
import {
  useRemote,
  ErrorBox,
  Loading,
  Empty,
  WordLink,
  languageName,
  route,
} from "./common";
import Link from "next/link";
type Browse = {
  total: number;
  page: number;
  pageSize: number;
  levelNote: string;
  items: (Word & { concept: Entity })[];
};
export default function Topics() {
  const params = useSearchParams();
  const [topic, setTopic] = useState(params.get("topic") || "");
  const [language, setLanguage] = useState("auto");
  const [scheme, setScheme] = useState("");
  const [rank, setRank] = useState("");
  const [include, setInclude] = useState(false);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const ts = useRemote<Entity[]>("/api/topics", revision);
  const ls = useRemote<Level[]>("/api/levels", revision);
  const query = new URLSearchParams({ page: String(page), language });
  if (topic) query.set("topic", topic);
  if (scheme) query.set("scheme", scheme);
  if (rank && scheme) query.set("maxRank", rank);
  if (include) query.set("includeUnspecified", "true");
  const result = useRemote<Browse>(`/api/browse?${query}`, revision);
  const schemes = [
    ...new Map(
      (ls.data || [])
        .filter((l) => l.scheme)
        .map((l) => [l.scheme, l.schemeLabel]),
    ).entries(),
  ];
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">BUILD CONNECTIONS BY SUBJECT</div>
          <h1>Follow a topic.</h1>
          <p>Explore vocabulary at the level of each individual meaning.</p>
        </div>
        <button
          className="button secondary"
          onClick={() => setRevision((r) => r + 1)}
        >
          ↻ Refresh data
        </button>
      </div>
      <section className="filter-panel">
        <label>
          Topic
          <select
            value={topic}
            onChange={(e) => {
              setTopic(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All topics</option>
            {ts.data?.map((t) => (
              <option key={t.iri} value={t.iri}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Language
          <select
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value);
              setPage(1);
            }}
          >
            <option value="auto">All languages</option>
            {["en", "vi", "zh"].map((l) => (
              <option key={l} value={l}>
                {languageName(l)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Framework
          <select
            value={scheme}
            onChange={(e) => {
              setScheme(e.target.value);
              setRank("");
              setPage(1);
            }}
          >
            <option value="">Any framework</option>
            {schemes.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Maximum level
          <select
            disabled={!scheme}
            value={rank}
            onChange={(e) => {
              setRank(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All levels</option>
            {ls.data
              ?.filter((l) => l.scheme === scheme && l.rank !== undefined)
              .map((l) => (
                <option key={l.iri} value={l.rank}>
                  {l.label}
                </option>
              ))}
          </select>
        </label>
        {scheme && (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={include}
              onChange={(e) => {
                setInclude(e.target.checked);
                setPage(1);
              }}
            />
            Include unspecified levels
          </label>
        )}
      </section>
      {(ts.error || ls.error) && (
        <ErrorBox
          error={ts.error || ls.error || ""}
          retry={() => setRevision((r) => r + 1)}
        />
      )}{" "}
      {result.loading && <Loading />}
      {result.error && (
        <ErrorBox
          error={result.error}
          retry={() => setRevision((r) => r + 1)}
        />
      )}{" "}
      {result.data && (
        <>
          <div className="section-heading">
            <h2>{result.data.total} entry senses</h2>
            <span className="muted">Page {page}</span>
          </div>
          <p className="muted">{result.data.levelNote}</p>
          {result.data.items.length ? (
            <div className="browse-grid">
              {result.data.items.map((w) => (
                <article className="browse-card" key={w.iri + "|" + w.senseIri}>
                  <span className="language-tag">
                    {languageName(w.language)}
                  </span>
                  <h3>
                    <WordLink word={w} />
                  </h3>
                  <p className="phonetics">
                    {w.phonetics.map((p) => p.value).join(" · ")}
                  </p>
                  <Link href={route("concept", w.concept.iri)}>
                    {w.concept.label} ↗
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <Empty>No senses match these filters.</Empty>
          )}
          <div className="pagination">
            <button
              className="button secondary"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              ← Previous
            </button>
            <span>
              {result.data.total} senses · {result.data.pageSize} per page
            </span>
            <button
              className="button secondary"
              disabled={page * result.data.pageSize >= result.data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
