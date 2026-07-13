// Merriam-Webster Learner's Dictionary client + response normaliser.
//
// The MW JSON response is an array of entry objects. Definitions come from the
// top-level `shortdef` array (with a fallback to the `dt` -> `text` tokens);
// example sentences come from `vis` verbal illustrations nested inside `dt`.
// See: https://dictionaryapi.com/products/json

const MW_BASE = "https://dictionaryapi.com/api/v3/references";

export interface WordEntry {
  word: string;
  partOfSpeech?: string;
  pronunciation?: string;
  definitions: string[];
  examples: string[];
}

export interface Suggestions {
  suggestions: string[];
}

export type LookupResult = WordEntry | Suggestions;

export function isEntry(r: LookupResult): r is WordEntry {
  return (r as WordEntry).word !== undefined;
}

// Strip Merriam-Webster formatting tokens from illustration/definition text.
export function stripTokens(s: string): string {
  return s
    // Tokens whose first pipe-field is the visible text, e.g. {sx|volume||}.
    .replace(
      /\{(?:sx|dxt|dx_def|dx_ety|a_link|d_link|i_link|et_link|mat|sxn)\|([^|}]*)[^}]*\}/g,
      "$1",
    )
    // Paired formatting tags -> keep the inner text.
    .replace(
      /\{\/?(?:it|wi|phrase|gloss|qword|inf|sup|sub|parahw|b|rom|sc|dx|dx_def|dx_ety)\}/g,
      "",
    )
    // Any remaining token, e.g. {bc}, {ldquo}, {rdquo}.
    .replace(/\{[^}]*\}/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Recursively collect `vis` example sentences or `text` defining text from the
// arbitrarily nested `def` structure.
function walkDt(node: unknown, kind: "vis" | "text", out: string[]): void {
  if (Array.isArray(node)) {
    if (node[0] === kind) {
      if (kind === "vis" && Array.isArray(node[1])) {
        for (const ex of node[1]) {
          if (ex && typeof ex.t === "string") out.push(stripTokens(ex.t));
        }
      } else if (kind === "text" && typeof node[1] === "string") {
        const t = stripTokens(node[1]);
        if (t) out.push(t);
      }
    }
    for (const item of node) walkDt(item, kind, out);
  } else if (node && typeof node === "object") {
    for (const v of Object.values(node)) walkDt(v, kind, out);
  }
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr.filter(Boolean))];
}

export function normalizeEntries(word: string, data: unknown): LookupResult {
  // A miss returns either an array of suggestion strings or an empty array.
  if (!Array.isArray(data) || data.length === 0 || typeof data[0] === "string") {
    return { suggestions: Array.isArray(data) ? (data as string[]) : [] };
  }

  const entries = data as Array<Record<string, any>>;
  const definitions: string[] = [];
  const examples: string[] = [];
  let partOfSpeech: string | undefined;
  let pronunciation: string | undefined;

  for (const e of entries) {
    if (!partOfSpeech && typeof e.fl === "string") partOfSpeech = e.fl;
    if (!pronunciation && e.hwi?.prs?.[0]?.mw) pronunciation = e.hwi.prs[0].mw;

    if (Array.isArray(e.shortdef) && e.shortdef.length) {
      for (const d of e.shortdef) {
        if (typeof d === "string") definitions.push(stripTokens(d));
      }
    } else {
      walkDt(e.def, "text", definitions);
    }
    walkDt(e.def, "vis", examples);
  }

  return {
    word,
    partOfSpeech,
    pronunciation,
    definitions: dedupe(definitions),
    examples: dedupe(examples),
  };
}

export async function lookupMW(
  word: string,
  key: string,
  ref = "learners",
): Promise<LookupResult> {
  const w = word.trim().toLowerCase();
  const url = `${MW_BASE}/${ref}/json/${encodeURIComponent(w)}?key=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Merriam-Webster request failed: ${res.status}`);
  const data = await res.json();
  return normalizeEntries(w, data);
}
