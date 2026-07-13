import { describe, it, expect } from "vitest";
import { normalizeEntries, stripTokens, isEntry } from "../src/mw";
import voluminous from "./fixtures/voluminous.json";
import notfound from "./fixtures/notfound.json";

describe("stripTokens", () => {
  it("removes paired italics tags, keeps inner text", () => {
    expect(stripTokens("a {it}voluminous{/it} skirt")).toBe("a voluminous skirt");
  });
  it("drops {bc} and keeps the {sx|...} link word", () => {
    expect(stripTokens("{bc}see {sx|volume||}")).toBe("see volume");
  });
});

describe("normalizeEntries", () => {
  it("extracts definitions, examples, part of speech, and pronunciation", () => {
    const r = normalizeEntries("voluminous", voluminous);
    expect(isEntry(r)).toBe(true);
    if (!isEntry(r)) return;
    expect(r.word).toBe("voluminous");
    expect(r.partOfSpeech).toBe("adjective");
    expect(r.pronunciation).toBe("vəˈluːmənəs");
    expect(r.definitions).toContain("having or containing a large amount");
    expect(r.examples).toContain("She wore a voluminous skirt.");
    expect(r.examples.length).toBeGreaterThanOrEqual(3);
    // All MW markup tokens stripped from examples.
    expect(r.examples.every((e) => !e.includes("{"))).toBe(true);
  });

  it("falls back to dt text when shortdef is absent", () => {
    const noShortdef = [
      {
        fl: "noun",
        def: [{ sseq: [[["sense", { dt: [["text", "{bc}a fallback definition"]] }]]] }],
      },
    ];
    const r = normalizeEntries("fallback", noShortdef);
    expect(isEntry(r) && r.definitions).toContain("a fallback definition");
  });

  it("returns suggestions for a miss", () => {
    const r = normalizeEntries("voluminus", notfound);
    expect(isEntry(r)).toBe(false);
    expect((r as { suggestions: string[] }).suggestions).toContain("voluminous");
  });
});
