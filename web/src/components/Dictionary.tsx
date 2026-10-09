"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Word } from "@/lib/types";
import {
  useRemote,
  ErrorBox,
  Loading,
  Empty,
  languageName,
  route,
} from "./common";
export default function Dictionary() {
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get("q") || "");
  const [needle, setNeedle] = useState(q);
  const [language, setLanguage] = useState("auto");
  const [revision, setRevision] = useState(0);
  const pendingOpen = useRef<{
    q: string;
    language: string;
    revision: number;
  } | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setNeedle(q.normalize("NFC").trim()), 250);
    return () => clearTimeout(timer);
  }, [q]);
  const result = useRemote<{ entries: Word[] }>(
    needle
      ? `/api/search?${new URLSearchParams({ q: needle, language })}`
      : null,
    revision,
  );
  const entries = result.data?.entries || [];
  useEffect(() => {
    const pending = pendingOpen.current;
    if (!pending) return;
    if (
      pending.q !== q.normalize("NFC").trim() ||
      pending.language !== language
    ) {
      pendingOpen.current = null;
      return;
    }
    if (!result.data || needle !== pending.q || revision !== pending.revision)
      return;
    pendingOpen.current = null;
    if (result.data.entries.length === 1)
      router.push(route("entry", result.data.entries[0].iri));
  }, [result.data, q, needle, language, revision, router]);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = q.normalize("NFC").trim();
    if (!normalized) return;
    if (needle === normalized && !result.loading && entries.length === 1)
      router.push(route("entry", entries[0].iri));
    else {
      pendingOpen.current = { q: normalized, language, revision: revision + 1 };
      setNeedle(normalized);
      setRevision(revision + 1);
    }
  }
  return (
    <div className="page dictionary-page">
      <section className="hero">
        <div className="eyebrow">
          <span className="tiny-line" /> A MULTILINGUAL WORD EXPLORER
        </div>
        <h1>
          Words connect.
          <br />
          <span>Discover how.</span>
        </h1>
        <p className="hero-copy">
          Explore meanings, translations, and the relationships
          <br className="desktop-break" /> between English, Vietnamese, and
          Chinese.
        </p>
        <form className="search-box" onSubmit={submit}>
          <span className="search-icon" aria-hidden>
            ⌕
          </span>
          <label className="sr-only" htmlFor="word-search">
            Search for a word
          </label>
          <input
            id="word-search"
            autoComplete="off"
            placeholder="Search a word in any language…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <label className="sr-only" htmlFor="search-language">
            Search language
          </label>
          <select
            id="search-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="auto">All languages</option>
            <option value="en">English</option>
            <option value="vi">Vietnamese</option>
            <option value="zh">Chinese</option>
          </select>
          <button className="button" type="submit">
            Explore <span aria-hidden>→</span>
          </button>
        </form>
        <div className="try-words">
          <span>Try a word</span>
          {["cat", "bank", "mèo", "猫", "白色"].map((word) => (
            <button key={word} onClick={() => setQ(word)}>
              {word}
              <span aria-hidden>↗</span>
            </button>
          ))}
        </div>
      </section>
      {needle ? (
        <section className="results-section" aria-live="polite">
          <div className="section-heading">
            <h2>Search results</h2>
            <span className="muted">
              {result.data
                ? `${entries.length} matching ${entries.length === 1 ? "entry" : "entries"}`
                : ""}
            </span>
          </div>
          {result.loading && <Loading />}
          {result.error && (
            <ErrorBox
              error={result.error}
              retry={() => setRevision((r) => r + 1)}
            />
          )}{" "}
          {result.data &&
            (entries.length ? (
              <div className="result-grid">
                {entries.map((w) => (
                  <Link
                    className="result-card"
                    href={route("entry", w.iri)}
                    key={w.iri}
                  >
                    <div className="result-top">
                      <span className="language-tag">
                        {languageName(w.language)}
                      </span>
                      <span aria-hidden>↗</span>
                    </div>
                    <h3 lang={w.language}>{w.writtenRep}</h3>
                    <p>
                      {w.pos.map((p) => p.label).join(" · ") ||
                        "Part of speech not recorded"}
                    </p>
                    <div className="phonetics">
                      {w.phonetics.map((p) => p.value).join(" · ")}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty>
                No entries match “{needle}”. Try another spelling or language.
              </Empty>
            ))}
        </section>
      ) : (
        <>
          <section className="explore-grid">
            <article>
              <div className="feature-icon">文</div>
              <h2>Across three languages</h2>
              <p>
                Find the words that share a meaning, with translations and
                synonyms side by side.
              </p>
              <button className="text-button" onClick={() => setQ("cat")}>
                Find a connection <span aria-hidden>→</span>
              </button>
            </article>
            <article>
              <div className="feature-icon">▤</div>
              <h2>Every meaning matters</h2>
              <p>
                Explore distinct senses, each with its own level, register, and
                examples from the source.
              </p>
              <button className="text-button" onClick={() => setQ("bank")}>
                Explore a word <span aria-hidden>→</span>
              </button>
            </article>
            <article>
              <div className="feature-icon">⌘</div>
              <h2>Follow your curiosity</h2>
              <p>
                Browse a topic, explore Han characters, or look at the knowledge
                graph behind the words.
              </p>
              <Link className="text-button" href="/topics">
                Browse topics <span aria-hidden>→</span>
              </Link>
            </article>
          </section>
          <div className="dictionary-note">
            <span className="status-dot online" />
            <p>
              Built on a shared vocabulary graph. Every meaning and connection
              comes from the loaded dataset.
            </p>
            <Link href="/developer">Explore the data ↗</Link>
          </div>
        </>
      )}
    </div>
  );
}
