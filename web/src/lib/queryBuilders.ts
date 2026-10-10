import { literal, resource } from "./namespaces";
export const wordFields = `?entry ontolex:canonicalForm ?form . ?form ontolex:writtenRep ?written . FILTER(LANG(?written) IN ("en","vi","zh")) OPTIONAL { ?form ontolex:phoneticRep ?phonetic } OPTIONAL { ?entry lexinfo:partOfSpeech ?pos . OPTIONAL { ?pos rdfs:label ?posLabel } }`;
export const levelFields = `OPTIONAL { ?sense lexnet:level ?level . OPTIONAL { ?level skos:notation ?notation } OPTIONAL { ?level skos:prefLabel ?levelLabel } OPTIONAL { ?level skos:inScheme ?scheme . OPTIONAL { ?scheme rdfs:label ?schemeLabel } } OPTIONAL { ?level lexnet:rank ?rank } } OPTIONAL { ?sense lexnet:register ?register . OPTIONAL { ?register rdfs:label ?registerLabel } }`;
/** English meaning of each sense of ?entry: the concept's definition, else its label. */
export const meaningFields = `OPTIONAL { ?entry ontolex:sense/ontolex:isLexicalizedSenseOf ?meaningConcept . OPTIONAL { ?meaningConcept skos:definition ?meaningDefinition . FILTER(LANG(?meaningDefinition)="en") } OPTIONAL { ?meaningConcept skos:prefLabel ?meaningLabel . FILTER(LANG(?meaningLabel)="en") } BIND(COALESCE(?meaningDefinition, ?meaningLabel) AS ?meaning) }`;
export function searchQuery(q: string, language: string, limit: number) {
  if (!["auto", "en", "vi", "zh"].includes(language))
    throw new Error("Unsupported language");
  return `SELECT DISTINCT ?entry ?form ?written ?pos ?posLabel ?phonetic ?exact ?meaning WHERE { { SELECT DISTINCT ?entry ?exact WHERE { ?entry a ontolex:LexicalEntry ; ontolex:canonicalForm/ontolex:writtenRep ?written . FILTER(LANG(?written) IN ("en","vi","zh")) ${language === "auto" ? "" : `FILTER(LANG(?written)=${literal(language)})`} BIND(LCASE(STR(?written)) AS ?haystack) BIND(LCASE(${literal(q)}) AS ?needle) FILTER(STRSTARTS(?haystack,?needle)) BIND(?haystack=?needle AS ?exact) } ORDER BY DESC(?exact) ?entry LIMIT ${limit} } ${wordFields} ${meaningFields} } ORDER BY DESC(?exact) ?written ?entry`;
}
export function confusablesQuery(id: string) {
  return `SELECT DISTINCT ?predicate ?predicateLabel ?entry ?form ?written ?pos ?posLabel ?phonetic ?meaning WHERE { VALUES ?origin { ${resource(id)} } VALUES ?predicate { lexnet:similarGlyph lexnet:similarMeaning lexnet:similarSound } { ?origin ?predicate ?entry } UNION { ?entry ?predicate ?origin } FILTER(?origin!=?entry) OPTIONAL { ?predicate rdfs:label ?predicateLabel } ${wordFields} ${meaningFields} }`;
}
export function sharedQuery(id: string) {
  return `SELECT DISTINCT ?entry ?written ?concept ?sense WHERE { VALUES ?origin { ${resource(id)} } ?origin ontolex:sense/ontolex:isLexicalizedSenseOf ?concept . ?entry ontolex:sense ?sense ; ontolex:canonicalForm/ontolex:writtenRep ?written . ?sense ontolex:isLexicalizedSenseOf ?concept . FILTER(?entry!=?origin) FILTER(LANG(?written) IN ("en","vi","zh")) } ORDER BY ?entry`;
}
export const polysemyQuery = `SELECT ?entry ?written (COUNT(DISTINCT ?sense) AS ?senseCount) WHERE { ?entry a ontolex:LexicalEntry ; ontolex:sense ?sense ; ontolex:canonicalForm/ontolex:writtenRep ?written . FILTER(LANG(?written) IN ("en","vi","zh")) } GROUP BY ?entry ?written HAVING(COUNT(DISTINCT ?sense)>=2) ORDER BY DESC(?senseCount) ?entry`;
