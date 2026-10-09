import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SenseCard } from "../src/components/EntryDetails";
import type { Sense } from "../src/lib/types";

test("sense cards distinguish repeated concept labels and show a definition only once", () => {
  for (const meaning of ["financial institution", "land beside a river"]) {
    const definitions = [
      { value: meaning, language: "en" },
      { value: "Vietnamese explanation", language: "vi" },
    ];
    const sense: Sense = {
      iri: "http://example.org/sense/bank",
      conceptIri: "http://example.org/concept/bank",
      labels: [],
      definitions,
      examples: [],
      concept: {
        iri: "http://example.org/concept/bank",
        label: "bank",
        labels: [],
        definitions,
        words: [],
        topics: [],
        relations: [],
        matches: [],
      },
    };
    const html = renderToStaticMarkup(
      createElement(SenseCard, { sense, index: 0 }),
    );
    assert.ok(html.includes(`<h2>${meaning}</h2>`));
    assert.equal(html.split(meaning).length - 1, 1);
    assert.ok(html.includes("Vietnamese explanation"));
    const fallback = {
      ...sense,
      concept: { ...sense.concept, definitions: [] },
    };
    assert.ok(
      renderToStaticMarkup(
        createElement(SenseCard, { sense: fallback, index: 0 }),
      ).includes("<h2>bank</h2>"),
    );
  }
});
