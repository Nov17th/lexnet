import type { Binding, Entity, LiteralValue, Row, Word, Level } from "./types";
import { localName } from "./namespaces";
export const value = (row: Row, key: string) => row[key]?.value || "";
export const asLiteral = (b: Binding): LiteralValue => ({
  value: b.value,
  ...(b["xml:lang"] ? { language: b["xml:lang"] } : {}),
  ...(b.datatype ? { datatype: b.datatype } : {}),
});
export function unique<T>(
  items: T[],
  key: (v: T) => string = (v) => JSON.stringify(v),
): T[] {
  return [...new Map(items.map((v) => [key(v), v])).values()];
}
export function labels(rows: Row[], key = "label") {
  return unique(rows.flatMap((r) => (r[key] ? [asLiteral(r[key])] : [])));
}
export function preferred(values: LiteralValue[], fallback: string) {
  return (
    ["en", "vi", "zh", ""]
      .map((l) => values.find((v) => (v.language || "") === l)?.value)
      .find(Boolean) ||
    values[0]?.value ||
    localName(fallback)
  );
}
export function entity(id: string, values: LiteralValue[] = []): Entity {
  return { iri: id, labels: values, label: preferred(values, id) };
}
export function group(rows: Row[], key: string) {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const id = value(r, key);
    if (id) map.set(id, [...(map.get(id) || []), r]);
  }
  return map;
}
export function level(rows: Row[]): Level | undefined {
  const r = rows.find((r) => r.level);
  if (!r) return;
  const id = value(r, "level");
  return {
    ...entity(id, labels(rows, "levelLabel")),
    notation: value(r, "notation"),
    scheme: value(r, "scheme"),
    schemeLabel: preferred(labels(rows, "schemeLabel"), value(r, "scheme")),
    rank: r.rank ? Number(r.rank.value) : undefined,
  };
}
export function words(rows: Row[]): Word[] {
  return [...group(rows, "entry")].flatMap(([id, rs]) =>
    [...group(rs, "written")].map(([, ws]) => {
      const r = ws[0];
      return {
        iri: id,
        writtenRep: value(r, "written"),
        language: r.written["xml:lang"] || "",
        formIri: value(r, "form"),
        phonetics: labels(rs, "phonetic"),
        pos: [...group(rs, "pos")].map(([p, ps]) =>
          entity(p, labels(ps, "posLabel")),
        ),
        ...(r.sense ? { senseIri: value(r, "sense") } : {}),
        level: level(rs),
        register: r.register
          ? entity(value(r, "register"), labels(rs, "registerLabel"))
          : undefined,
      };
    }),
  );
}
