"use client";
import Link from "next/link";
import type { Binding, QueryResult } from "@/lib/types";
import { detailRoute } from "@/lib/resourceRoutes";
import { Empty } from "./common";
function Cell({
  binding: b,
  onResource,
}: {
  binding?: Binding;
  onResource?: (iri: string) => void;
}) {
  if (!b) return <span className="muted">—</span>;
  const href = b.type === "uri" ? detailRoute(b.value) : undefined;
  return (
    <span className="binding-cell">
      {b.type === "uri" ? (
        href ? (
          <Link href={href}>{b.value}</Link>
        ) : (
          <a href={b.value} target="_blank" rel="noreferrer">
            {b.value}
          </a>
        )
      ) : (
        b.value
      )}
      <small>
        {b.type}
        {b["xml:lang"] ? ` · @${b["xml:lang"]}` : ""}
        {b.datatype ? ` · ${b.datatype}` : ""}
      </small>
      {onResource && b.type === "uri" && (
        <button className="text-button" onClick={() => onResource(b.value)}>
          Graph ↗
        </button>
      )}
    </span>
  );
}
export default function QueryTable({
  result,
  onResource,
}: {
  result: QueryResult;
  onResource?: (iri: string) => void;
}) {
  if (result.kind === "ASK")
    return (
      <div className="ask-result">
        ASK result <strong>{String(result.boolean)}</strong>
      </div>
    );
  const variables =
    result.kind === "SELECT"
      ? result.variables
      : ["subject", "predicate", "object"];
  const rows = result.kind === "SELECT" ? result.rows : result.triples;
  return (
    <>
      {result.truncated && (
        <div className="notice">
          Display limit reached. Results are truncated.
        </div>
      )}
      {rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {variables.map((v) => (
                  <th key={v}>{v}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {variables.map((v) => (
                    <td key={v}>
                      <Cell
                        binding={(r as Record<string, Binding>)[v]}
                        onResource={onResource}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>Query completed with no results.</Empty>
      )}
    </>
  );
}
