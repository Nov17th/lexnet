/** Preserve the complete IRI in the query string, including hash fragments. */
export function detailRoute(iri: string): string | undefined {
  const kind = iri.match(/[/#](entry|concept|char)\//u)?.[1];
  if (!kind) return undefined;
  const page = kind === "char" ? "character" : kind;
  return `/${page}?${new URLSearchParams({ iri })}`;
}
