export type LiteralValue = {
  value: string;
  language?: string;
  datatype?: string;
};
export type Binding = {
  type: "uri" | "literal" | "bnode" | "typed-literal";
  value: string;
  "xml:lang"?: string;
  datatype?: string;
};
export type Row = Record<string, Binding>;
export type Entity = { iri: string; label: string; labels: LiteralValue[] };
export type Level = Entity & {
  notation: string;
  scheme: string;
  schemeLabel: string;
  rank?: number;
};
export type Word = {
  iri: string;
  writtenRep: string;
  language: string;
  formIri: string;
  pos: Entity[];
  phonetics: LiteralValue[];
  senseIri?: string;
  register?: Entity;
  level?: Level;
};
export type Relation = Entity & {
  kind: string;
  predicate: string;
  predicateLabel: string;
};
export type Concept = Entity & {
  definitions: LiteralValue[];
  topics: Entity[];
  words: Word[];
  relations: Relation[];
  matches: { iri: string; kind: string }[];
};
export type Sense = {
  iri: string;
  conceptIri: string;
  labels: LiteralValue[];
  definitions: LiteralValue[];
  level?: Level;
  register?: Entity;
  examples: LiteralValue[];
  concept: Concept;
};
export type Entry = Word & {
  senses: Sense[];
  confusables: (Word & { predicate: string; predicateLabel: string })[];
  characters: (Entity & { definitions: LiteralValue[] })[];
  lexemes: string[];
};
export type Character = Entity & {
  strokes?: number;
  readings: string[];
  commonReadings: string[];
  definitions: LiteralValue[];
  radicals: (Entity & {
    variants: string[];
    number?: number;
    definitions: LiteralValue[];
  })[];
  similar: Entity[];
  words: Word[];
  radicalPeers: Entity[];
  page: number;
  hasMore: boolean;
};
export type Coverage = {
  numerator: number;
  denominator: number;
  ratio: number | null;
  population: string;
};
export type Stats = {
  counts: Record<string, number>;
  languages: {
    language: string;
    entries: number;
    senses: number;
    writtenForms: number;
    levels: Coverage;
    examples: Coverage;
    registers: Coverage;
    lexemes: Coverage;
  }[];
  topics: (Entity & { entries: number; senses: number })[];
  matches: Record<string, Coverage>;
};
export type GraphNode = {
  id: string;
  iri: string;
  type: string;
  label: string;
  expandable: boolean;
};
export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  predicate: string;
  label: string;
  provenance: "Asserted" | "Derived by query";
};
export type Graph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;
  limits: { nodes: number; edges: number };
};
export type AudioResult = {
  status: "available" | "unavailable" | "error" | "disabled";
  candidates: {
    url: string;
    mime: string;
    representation: string;
    source: string;
    label: string;
    filename: string;
  }[];
  message?: string;
};
export type QuerySample = {
  id: string;
  title: string;
  query: string;
  federated: boolean;
};
export type QueryResult =
  | { kind: "SELECT"; variables: string[]; rows: Row[]; truncated: boolean }
  | { kind: "ASK"; boolean: boolean }
  | {
      kind: "CONSTRUCT" | "DESCRIBE";
      triples: { subject: Binding; predicate: Binding; object: Binding }[];
      truncated: boolean;
    };
