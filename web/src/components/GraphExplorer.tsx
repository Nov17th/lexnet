"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type cytoscape from "cytoscape";
import type { Graph, Word } from "@/lib/types";
import { detailRoute } from "@/lib/resourceRoutes";
import { api, ErrorBox, Loading, useRemote } from "./common";
const palette: Record<string, string> = {
  "Lexical entry": "#227c66",
  Concept: "#526ec0",
  "Lexical sense": "#c58d36",
  Form: "#8f67ab",
  "Han character": "#d0715d",
  Radical: "#ba6395",
};
export default function GraphExplorer({ initialIri }: { initialIri: string }) {
  const [focus, setFocus] = useState(initialIri);
  const [input, setInput] = useState("");
  const [depth, setDepth] = useState(1);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState("");
  const [combined, setCombined] = useState<Graph | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fallback, setFallback] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const cy = useRef<cytoscape.Core | null>(null);
  const result = useRemote<Graph>(
    focus
      ? `/api/graph?${new URLSearchParams({ iri: focus, depth: String(depth) })}`
      : null,
    revision,
  );
  const search = useRemote<{ entries: Word[] }>(
    input
      ? `/api/search?${new URLSearchParams({ q: input, limit: "8" })}`
      : null,
  );
  const data = combined || result.data;
  useEffect(() => {
    if (!container.current || !data) return;
    let cancelled = false;
    import("cytoscape")
      .then(({ default: cytoscape }) => {
        if (cancelled || !container.current) return;
        cy.current = cytoscape({
          container: container.current,
          elements: [
            ...data.nodes.map((n) => ({
              data: { ...n, color: palette[n.type] || "#6b7b83" },
            })),
            ...data.edges.map((e) => ({ data: e })),
          ],
          style: [
            {
              selector: "node",
              style: {
                label: "data(label)",
                "background-color": "data(color)",
                color: "#263b35",
                "font-size": 12,
                "text-valign": "bottom",
                "text-margin-y": 8,
                width: 32,
                height: 32,
                "text-max-width": "100px",
                "text-wrap": "wrap",
              },
            },
            {
              selector: "edge",
              style: {
                label: "data(label)",
                width: 1.3,
                "line-color": "#ced8d3",
                "target-arrow-color": "#aebeb5",
                "target-arrow-shape": "triangle",
                "curve-style": "bezier",
                "font-size": 9,
                color: "#718078",
                "text-background-color": "#fafbf8",
                "text-background-opacity": 0.85,
                "text-background-padding": "3px",
              },
            },
            {
              selector: ":selected",
              style: { "border-width": 3, "border-color": "#172f27" },
            },
          ],
          layout: {
            name: "cose",
            animate: false,
            nodeRepulsion: () => 8000,
            idealEdgeLength: () => 110,
          },
          wheelSensitivity: 0.2,
        });
        cy.current.on("tap", "node", (e) => setSelected(e.target.id()));
      })
      .catch(() => setFallback(true));
    return () => {
      cancelled = true;
      cy.current?.destroy();
      cy.current = null;
    };
  }, [data]);
  async function expand() {
    if (!selected || !data) return;
    setBusy(true);
    setError("");
    try {
      const more = await api<Graph>(
        `/api/graph?${new URLSearchParams({ iri: selected, depth: "1" })}`,
      );
      const nodes = [
        ...new Map(
          [...data.nodes, ...more.nodes].map((n) => [n.id, n]),
        ).values(),
      ];
      const edges = [
        ...new Map(
          [...data.edges, ...more.edges].map((e) => [e.id, e]),
        ).values(),
      ];
      const allowed = new Set(
        nodes.slice(0, data.limits.nodes).map((n) => n.id),
      );
      setCombined({
        nodes: nodes.slice(0, data.limits.nodes),
        edges: edges
          .filter((e) => allowed.has(e.source) && allowed.has(e.target))
          .slice(0, data.limits.edges),
        limits: data.limits,
        truncated:
          data.truncated ||
          more.truncated ||
          nodes.length > data.limits.nodes ||
          edges.length > data.limits.edges,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Expansion failed");
    } finally {
      setBusy(false);
    }
  }
  const selectedRoute = detailRoute(selected);
  return (
    <section className="graph-panel">
      <div className="graph-toolbar">
        <label>
          Find a starting word
          <input
            placeholder="Search a word…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </label>
        <label>
          Neighborhood depth
          <select
            value={depth}
            onChange={(e) => {
              setDepth(Number(e.target.value));
              setCombined(null);
            }}
          >
            {[1, 2, 3].map((d) => (
              <option key={d} value={d}>
                {d} step{d > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button secondary"
          onClick={() => {
            setCombined(null);
            setRevision((r) => r + 1);
            setSelected("");
          }}
        >
          Reset
        </button>
        <button
          className="button secondary"
          onClick={() => cy.current?.fit(undefined, 35)}
        >
          Fit
        </button>
        <button
          className="button secondary"
          aria-label="Zoom in"
          onClick={() => cy.current?.zoom(cy.current.zoom() * 1.25)}
        >
          +
        </button>
        <button
          className="button secondary"
          aria-label="Zoom out"
          onClick={() => cy.current?.zoom(cy.current.zoom() / 1.25)}
        >
          −
        </button>
      </div>
      {search.data && input && (
        <div className="chips graph-search-results">
          {search.data.entries.map((w) => (
            <button
              className="word-chip"
              key={w.iri}
              onClick={() => {
                setFocus(w.iri);
                setCombined(null);
                setInput("");
                setSelected("");
              }}
            >
              {w.writtenRep} · {w.language} ·{" "}
              {w.pos.map((p) => p.label).join(", ")}
            </button>
          ))}
        </div>
      )}
      {search.error && <ErrorBox error={search.error} />}{" "}
      {!focus && (
        <p className="empty">Choose a word to open its local neighborhood.</p>
      )}
      {result.loading && <Loading />}
      {(result.error || error) && (
        <ErrorBox
          error={result.error || error}
          retry={() => setRevision((r) => r + 1)}
        />
      )}{" "}
      {data && (
        <>
          <div className="graph-legend">
            {Object.entries(palette).map(([type, color]) => (
              <span key={type}>
                <i style={{ background: color }} />
                {type}
              </span>
            ))}
          </div>
          <div
            className="graph-canvas"
            ref={container}
            aria-label="Interactive LexNet knowledge graph"
            role="region"
          />
          {data.truncated && (
            <div className="notice">
              Neighborhood truncated to the configured limits. Select a node to
              explore another neighborhood.
            </div>
          )}
          <div className="graph-selection">
            {selected ? (
              <>
                <code>{selected}</code>
                <button
                  className="button"
                  disabled={
                    busy ||
                    !data.nodes.find((n) => n.id === selected)?.expandable
                  }
                  onClick={expand}
                >
                  {busy ? "Expanding…" : "Expand 1 step"}
                </button>
                <button
                  className="button secondary"
                  disabled={
                    !data.nodes.find((n) => n.id === selected)?.expandable
                  }
                  onClick={() => {
                    setFocus(selected);
                    setCombined(null);
                  }}
                >
                  Focus here
                </button>
                {selectedRoute && (
                  <Link href={selectedRoute}>Open details ↗</Link>
                )}
              </>
            ) : (
              <span className="muted">
                Select a node to inspect or expand it.
              </span>
            )}
          </div>
          <details open={fallback}>
            <summary>
              Node and edge tables · {data.nodes.length} nodes /{" "}
              {data.edges.length} edges
            </summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Node</th>
                    <th>Type</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.nodes.map((n) => (
                    <tr key={n.id}>
                      <td>
                        {n.label}
                        <small>{n.iri}</small>
                      </td>
                      <td>{n.type}</td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => setSelected(n.id)}
                        >
                          Select
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Relation</th>
                    <th>Target</th>
                    <th>Provenance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.edges.map((e) => (
                    <tr key={e.id}>
                      <td>
                        {data.nodes.find((n) => n.id === e.source)?.label}
                      </td>
                      <td>{e.label}</td>
                      <td>
                        {data.nodes.find((n) => n.id === e.target)?.label}
                      </td>
                      <td>{e.provenance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
