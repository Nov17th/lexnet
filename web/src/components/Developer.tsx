"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import type { QueryResult, Stats, Word, Coverage } from "@/lib/types";
import { api, ErrorBox, Loading, useRemote } from "./common";
import QueryTable from "./QueryTable";
const GraphExplorer = dynamic(() => import("./GraphExplorer"), {
  ssr: false,
  loading: () => <Loading />,
});
type Tab = "overview" | "graph" | "sparql" | "derived";
const samples = [
  {
    title: "Lexical entries and written forms",
    query:
      'PREFIX ontolex: <http://www.w3.org/ns/lemon/ontolex#>\nSELECT ?entry ?word WHERE {\n  ?entry a ontolex:LexicalEntry ;\n         ontolex:canonicalForm/ontolex:writtenRep ?word .\n  FILTER(LANG(?word) IN ("en", "vi", "zh"))\n}\nORDER BY ?entry\nLIMIT 30',
  },
  {
    title: "Does the dataset contain words?",
    query:
      "PREFIX ontolex: <http://www.w3.org/ns/lemon/ontolex#>\nASK { ?entry a ontolex:LexicalEntry }",
  },
  {
    title: "Entries with multiple senses",
    query:
      "PREFIX ontolex: <http://www.w3.org/ns/lemon/ontolex#>\nSELECT ?entry (COUNT(DISTINCT ?sense) AS ?senseCount) WHERE {\n  ?entry a ontolex:LexicalEntry ; ontolex:sense ?sense .\n}\nGROUP BY ?entry\nHAVING(COUNT(DISTINCT ?sense) >= 2)",
  },
  {
    title: "Construct a small entry graph",
    query:
      "PREFIX ontolex: <http://www.w3.org/ns/lemon/ontolex#>\nCONSTRUCT { ?entry ontolex:sense ?sense } WHERE {\n  ?entry a ontolex:LexicalEntry ; ontolex:sense ?sense .\n}\nLIMIT 12",
  },
];
const percentage = (c: Coverage) =>
  c.ratio === null ? "N/A" : `${(c.ratio * 100).toFixed(1)}%`;
function CoverageCell({ coverage: c }: { coverage: Coverage }) {
  return (
    <div title={c.population}>
      <strong>{percentage(c)}</strong>
      <small>
        {c.numerator} / {c.denominator}
      </small>
      <div className="coverage-bar">
        <span style={{ width: `${(c.ratio || 0) * 100}%` }} />
      </div>
    </div>
  );
}
function Overview({ revision }: { revision: number }) {
  const result = useRemote<Stats>("/api/stats", revision);
  return (
    <>
      {result.loading && <Loading />}
      {result.error && <ErrorBox error={result.error} />}{" "}
      {result.data && (
        <>
          <div className="stats-grid">
            {Object.entries(result.data.counts).map(([label, n]) => (
              <article key={label}>
                <span>{label.replace(/([a-z])([A-Z])/g, "$1 $2")}</span>
                <strong>{n.toLocaleString()}</strong>
                <small>Distinct RDF resources</small>
              </article>
            ))}
          </div>
          <section className="panel">
            <h2>Language coverage</h2>
            <p className="muted">
              Level, example, and register coverage use distinct senses. Lexeme
              coverage uses distinct entries. Vietnamese levels are reported as
              recorded, without assuming a CEFR or HSK requirement.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Language</th>
                    <th>Entries</th>
                    <th>Senses</th>
                    <th>Written forms</th>
                    <th>Levels / senses</th>
                    <th>Examples / senses</th>
                    <th>Registers / senses</th>
                    <th>Lexemes / entries</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.languages.map((l) => (
                    <tr key={l.language}>
                      <td>{l.language}</td>
                      <td>{l.entries}</td>
                      <td>{l.senses}</td>
                      <td>{l.writtenForms}</td>
                      {[l.levels, l.examples, l.registers, l.lexemes].map(
                        (c, i) => (
                          <td key={i}>
                            <CoverageCell coverage={c} />
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="overview-columns">
            <section className="panel">
              <h2>Wikidata concept links</h2>
              {Object.entries(result.data.matches).map(([kind, c]) => (
                <div className="match-row" key={kind}>
                  <span>
                    {kind === "either"
                      ? "Exact or close match"
                      : kind === "exactMatch"
                        ? "Exact match"
                        : "Close match"}
                  </span>
                  <CoverageCell coverage={c} />
                </div>
              ))}
              <p className="muted">
                A link records the source mapping; it does not establish
                independent verification.
              </p>
            </section>
            <section className="panel">
              <h2>Topic distribution</h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Topic</th>
                      <th>Entries</th>
                      <th>Senses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.topics.map((t) => (
                      <tr key={t.iri}>
                        <td>{t.label}</td>
                        <td>{t.entries}</td>
                        <td>{t.senses}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}
function Console({ openGraph }: { openGraph: (iri: string) => void }) {
  const [query, setQuery] = useState(samples[0].query);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);
  async function run() {
    const c = new AbortController();
    setController(c);
    setRunning(true);
    setError("");
    setResult(null);
    const started = performance.now();
    try {
      const response = await api<{ result: QueryResult; elapsedMs: number }>(
        "/api/sparql",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
          signal: c.signal,
        },
      );
      setResult(response.result);
      setElapsed(response.elapsedMs);
    } catch (e) {
      setError(
        c.signal.aborted
          ? "Query cancelled."
          : e instanceof Error
            ? e.message
            : "Query failed",
      );
      setElapsed(Math.round(performance.now() - started));
    } finally {
      setRunning(false);
      setController(null);
    }
  }
  return (
    <section className="panel console-panel">
      <div className="section-heading">
        <h2>SPARQL console</h2>
        <span className="badge green">Read only</span>
      </div>
      <label className="sample-selector">
        Sample query
        <select
          onChange={(e) => setQuery(samples[Number(e.target.value)].query)}
          defaultValue="0"
        >
          {samples.map((s, i) => (
            <option key={s.title} value={i}>
              {s.title}
            </option>
          ))}
        </select>
      </label>
      <label className="editor-label" htmlFor="sparql-query">
        Query editor
      </label>
      <textarea
        id="sparql-query"
        className="query-editor"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        spellCheck={false}
      />
      <div className="query-actions">
        <button className="button" disabled={running} onClick={run}>
          {running ? "Running…" : "Run query →"}
        </button>
        {running && (
          <button
            className="button secondary"
            onClick={() => controller?.abort()}
          >
            Cancel
          </button>
        )}
        {elapsed !== null && <span className="muted">{elapsed} ms</span>}
      </div>
      {error && <ErrorBox error={error} />}{" "}
      {result && <QueryTable result={result} onResource={openGraph} />}
    </section>
  );
}
function Derived({
  initialIri,
  revision,
}: {
  initialIri: string;
  revision: number;
}) {
  const [kind, setKind] = useState("polysemy");
  const [id, setId] = useState(initialIri);
  const [q, setQ] = useState("");
  const search = useRemote<{ entries: Word[] }>(
    q ? `/api/search?${new URLSearchParams({ q, limit: "8" })}` : null,
  );
  const result = useRemote<QueryResult>(
    kind === "polysemy" || id
      ? `/api/derived?${new URLSearchParams({ kind, ...(id ? { iri: id } : {}) })}`
      : null,
    revision,
  );
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Derived results</h2>
        <span className="badge amber">Derived by SPARQL</span>
      </div>
      <p>
        Query calculations over the asserted data. These results do not run an
        OWL classifier or HermiT.
      </p>
      <label>
        Calculation
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="polysemy">Entries with at least two senses</option>
          <option value="shared">Entries sharing a concept</option>
          <option value="confusables">
            Confusable words in either direction
          </option>
        </select>
      </label>
      {kind !== "polysemy" && (
        <>
          <label>
            Choose a source word
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search an entry…"
            />
          </label>
          <div className="chips">
            {search.data?.entries.map((w) => (
              <button
                className="word-chip"
                key={w.iri}
                onClick={() => {
                  setId(w.iri);
                  setQ("");
                }}
              >
                {w.writtenRep} · {w.language} ·{" "}
                {w.pos.map((p) => p.label).join(", ")}
              </button>
            ))}
          </div>
          {search.error && <ErrorBox error={search.error} />}{" "}
          {id ? (
            <code className="derived-source">{id}</code>
          ) : (
            <p className="muted">Choose an entry to run this calculation.</p>
          )}
        </>
      )}
      {result.loading && <Loading />}
      {result.error && <ErrorBox error={result.error} />}{" "}
      {result.data && <QueryTable result={result.data} />}
    </section>
  );
}
export default function Developer() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = (
    ["overview", "graph", "sparql", "derived"].includes(params.get("tab") || "")
      ? params.get("tab")
      : "overview"
  ) as Tab;
  const id = params.get("iri") || "";
  const [revision, setRevision] = useState(0);
  function openGraph(iri: string) {
    router.push(`/developer?${new URLSearchParams({ tab: "graph", iri })}`);
  }
  return (
    <div className="page developer-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">UNDER THE WORDS</div>
          <h1>Explore the knowledge.</h1>
          <p>Live dataset statistics, connected resources, and queries.</p>
        </div>
        <button
          className="button secondary"
          onClick={() => setRevision((r) => r + 1)}
        >
          ↻ Refresh data
        </button>
      </div>
      <nav className="tabs" aria-label="Developer tools">
        {(["overview", "graph", "sparql", "derived"] as Tab[]).map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() =>
              router.push(
                `/developer?${new URLSearchParams({ tab: t, ...(id ? { iri: id } : {}) })}`,
              )
            }
          >
            {
              {
                overview: "Overview",
                graph: "Knowledge graph",
                sparql: "SPARQL",
                derived: "Derived results",
              }[t]
            }
          </button>
        ))}
      </nav>
      {tab === "overview" && <Overview revision={revision} />}{" "}
      {tab === "graph" && (
        <GraphExplorer key={id + "|" + revision} initialIri={id} />
      )}{" "}
      {tab === "sparql" && <Console openGraph={openGraph} />}{" "}
      {tab === "derived" && <Derived initialIri={id} revision={revision} />}
    </div>
  );
}
