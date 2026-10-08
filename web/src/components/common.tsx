"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Entity, LiteralValue, Word } from "@/lib/types";
export const languageName = (l: string) =>
  ({ en: "English", vi: "Vietnamese", zh: "Chinese" })[l] || l;
export const route = (type: string, id: string) =>
  `/${type}?${new URLSearchParams({ iri: id })}`;
export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}
export function useRemote<T>(url: string | null, revision = 0) {
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>(
    { key: "" },
  );
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    api<T>(url, { signal: controller.signal })
      .then((data) => setState({ key: url + "#" + revision, data }))
      .catch((e) => {
        if (!controller.signal.aborted)
          setState({ key: url + "#" + revision, error: e.message });
      });
    return () => controller.abort();
  }, [url, revision]);
  const current = state.key === url + "#" + revision;
  return {
    data: current ? state.data : undefined,
    error: current ? state.error : undefined,
    loading: !!url && (!current || (!state.data && !state.error)),
  };
}
export function ErrorBox({
  error,
  retry,
}: {
  error: string;
  retry?: () => void;
}) {
  return (
    <div role="alert" className="error-box">
      <strong>Unable to load data</strong>
      <p>{error}</p>
      {retry && (
        <button className="button secondary" onClick={retry}>
          Retry
        </button>
      )}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      Loading from LexNet…
    </div>
  );
}
export function Literals({ values }: { values: LiteralValue[] }) {
  return (
    <>
      {values.map((v, i) => (
        <span
          className="literal"
          key={`${v.value}-${v.language}-${i}`}
          lang={v.language}
        >
          {v.value}
          {v.language && <small>{v.language}</small>}
        </span>
      ))}
    </>
  );
}
export function EntityLink({
  entity,
  type = "concept",
}: {
  entity: Entity;
  type?: string;
}) {
  return (
    <Link className="word-chip" href={route(type, entity.iri)}>
      {entity.label} <span aria-hidden>↗</span>
    </Link>
  );
}
export function WordLink({ word }: { word: Word }) {
  return (
    <Link
      className="word-chip"
      href={route("entry", word.iri)}
      lang={word.language}
    >
      {word.writtenRep}
      <small>
        {word.pos.map((p) => p.label).join(", ")}
        {word.register ? ` · ${word.register.label}` : ""}
        {word.level ? ` · ${word.level.label}` : ""}
      </small>
    </Link>
  );
}
export function WordList({ words }: { words: Word[] }) {
  return (
    <div className="language-grid">
      {["en", "vi", "zh"].map((language) => (
        <div key={language}>
          <h4>{languageName(language)}</h4>
          <div className="chips">
            {words
              .filter((w) => w.language === language)
              .map((w) => (
                <WordLink key={w.iri + "|" + w.senseIri} word={w} />
              ))}
            {!words.some((w) => w.language === language) && (
              <span className="muted">Not recorded</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}
