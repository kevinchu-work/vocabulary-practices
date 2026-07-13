import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker, { type Env } from "../src/index";
import voluminous from "./fixtures/voluminous.json";

// Minimal in-memory KVNamespace stand-in — enough for the handlers we exercise.
function mockKV() {
  const store = new Map<string, string>();
  return {
    _store: store,
    async get(k: string) {
      return store.has(k) ? store.get(k)! : null;
    },
    async put(k: string, v: string) {
      store.set(k, v);
    },
    async delete(k: string) {
      store.delete(k);
    },
    async list({ prefix }: { prefix: string }) {
      const keys = [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name }));
      return { keys, list_complete: true, cacheStatus: null };
    },
  };
}

const TOKEN = "secret";
const auth = { Authorization: "Bearer " + TOKEN };
function env(kv: ReturnType<typeof mockKV>): Env {
  return { VOCAB: kv as unknown as KVNamespace, MW_KEY: "x", API_TOKEN: TOKEN, MW_REF: "learners" };
}
function req(path: string, init?: RequestInit) {
  return new Request("https://example.com" + path, init);
}

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn(async () => new Response(JSON.stringify(voluminous), { status: 200 }));
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

describe("worker API", () => {
  it("rejects a request with no bearer token", async () => {
    const res = await worker.fetch(req("/lookup?word=voluminous"), env(mockKV()));
    expect(res.status).toBe(401);
  });

  it("serves the practice page without auth", async () => {
    const res = await worker.fetch(req("/"), env(mockKV()));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("looks a word up, then serves the second call from cache (no second MW hit)", async () => {
    const kv = mockKV();
    const r1 = await worker.fetch(req("/lookup?word=voluminous", { headers: auth }), env(kv));
    expect(r1.status).toBe(200);
    const body = (await r1.json()) as { definitions: string[] };
    expect(body.definitions).toContain("having or containing a large amount");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await worker.fetch(req("/lookup?word=voluminous", { headers: auth }), env(kv));
    expect(fetchSpy).toHaveBeenCalledTimes(1); // cache hit — MW not called again
  });

  it("saves, lists, records a practice result, and deletes", async () => {
    const kv = mockKV();
    const headers = { ...auth, "content-type": "application/json" };

    const save = await worker.fetch(
      req("/words", { method: "POST", headers, body: JSON.stringify({ word: "voluminous" }) }),
      env(kv),
    );
    expect(save.status).toBe(201);

    const list = await worker.fetch(req("/words", { headers: auth }), env(kv));
    const listBody = (await list.json()) as { words: Array<{ word: string; timesPracticed: number }> };
    expect(listBody.words).toHaveLength(1);
    expect(listBody.words[0].word).toBe("voluminous");
    expect(listBody.words[0].timesPracticed).toBe(0);

    const result = await worker.fetch(
      req("/practice/result", {
        method: "POST",
        headers,
        body: JSON.stringify({ word: "voluminous", correct: true }),
      }),
      env(kv),
    );
    const resultBody = (await result.json()) as { timesPracticed: number; lastCorrect: boolean };
    expect(resultBody.timesPracticed).toBe(1);
    expect(resultBody.lastCorrect).toBe(true);

    const del = await worker.fetch(req("/words/voluminous", { method: "DELETE", headers: auth }), env(kv));
    expect(del.status).toBe(200);

    const list2 = await worker.fetch(req("/words", { headers: auth }), env(kv));
    expect(((await list2.json()) as { words: unknown[] }).words).toHaveLength(0);
  });

  it("returns 404 with suggestions when saving an unknown word", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(["voluminous", "volume"]), { status: 200 }));
    const kv = mockKV();
    const res = await worker.fetch(
      req("/words", {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ word: "voluminus" }),
      }),
      env(kv),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { suggestions: string[] };
    expect(body.suggestions).toContain("voluminous");
  });
});
