import { lookupMW, isEntry, type LookupResult, type WordEntry } from "./mw";
import { checkAuth } from "./auth";
import { PRACTICE_PAGE } from "./page";

export interface Env {
  VOCAB: KVNamespace;
  MW_KEY: string;
  API_TOKEN: string;
  MW_REF?: string;
}

const DEF_TTL = 60 * 60 * 24 * 30; // cache lookups for 30 days

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

// Fetch a normalised lookup, using the KV cache first. Only real entries are
// cached (a "not found" suggestion list is not).
async function getLookup(word: string, env: Env): Promise<LookupResult> {
  const key = `def:${word}`;
  const cached = await env.VOCAB.get(key);
  if (cached) return JSON.parse(cached) as LookupResult;

  const result = await lookupMW(word, env.MW_KEY, env.MW_REF ?? "learners");
  if (isEntry(result)) {
    await env.VOCAB.put(key, JSON.stringify(result), { expirationTtl: DEF_TTL });
  }
  return result;
}

async function handleLookup(url: URL, env: Env): Promise<Response> {
  const word = (url.searchParams.get("word") || "").trim().toLowerCase();
  if (!word) return json({ error: "missing word" }, 400);
  return json(await getLookup(word, env));
}

async function handleSave(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { word?: string };
  const word = String(body.word || "").trim().toLowerCase();
  if (!word) return json({ error: "missing word" }, 400);

  const lookup = await getLookup(word, env);
  if (!isEntry(lookup)) {
    return json(
      { error: "word not found", suggestions: (lookup as { suggestions: string[] }).suggestions },
      404,
    );
  }

  const entry = lookup as WordEntry;
  const saved = {
    word: entry.word,
    partOfSpeech: entry.partOfSpeech,
    pronunciation: entry.pronunciation,
    definition: entry.definitions[0] ?? "",
    definitions: entry.definitions,
    examples: entry.examples,
    savedAt: new Date().toISOString(),
    timesPracticed: 0,
    lastCorrect: null as boolean | null,
  };
  await env.VOCAB.put(`word:${word}`, JSON.stringify(saved));
  return json(saved, 201);
}

async function handleList(env: Env): Promise<Response> {
  const { keys } = await env.VOCAB.list({ prefix: "word:" });
  const words = await Promise.all(
    keys.map(async (k) => JSON.parse((await env.VOCAB.get(k.name)) ?? "null")),
  );
  return json({ words: words.filter(Boolean) });
}

async function handleDelete(pathname: string, env: Env): Promise<Response> {
  const word = decodeURIComponent(pathname.slice("/words/".length)).trim().toLowerCase();
  if (!word) return json({ error: "missing word" }, 400);
  await env.VOCAB.delete(`word:${word}`);
  return json({ deleted: word });
}

async function handleResult(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { word?: string; correct?: boolean };
  const word = String(body.word || "").trim().toLowerCase();
  if (!word) return json({ error: "missing word" }, 400);

  const raw = await env.VOCAB.get(`word:${word}`);
  if (!raw) return json({ error: "not saved" }, 404);

  const saved = JSON.parse(raw);
  saved.timesPracticed = (saved.timesPracticed || 0) + 1;
  saved.lastCorrect = Boolean(body.correct);
  saved.lastPracticedAt = new Date().toISOString();
  await env.VOCAB.put(`word:${word}`, JSON.stringify(saved));
  return json(saved);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    // Public: the practice web page.
    if (method === "GET" && pathname === "/") {
      return new Response(PRACTICE_PAGE, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    // Everything else requires the bearer token.
    if (!checkAuth(request, env.API_TOKEN)) {
      return json({ error: "unauthorized" }, 401);
    }

    try {
      if (method === "GET" && pathname === "/lookup") return await handleLookup(url, env);
      if (method === "POST" && pathname === "/words") return await handleSave(request, env);
      if (method === "GET" && pathname === "/words") return await handleList(env);
      if (method === "DELETE" && pathname.startsWith("/words/"))
        return await handleDelete(pathname, env);
      if (method === "POST" && pathname === "/practice/result")
        return await handleResult(request, env);
      return json({ error: "not found" }, 404);
    } catch (err) {
      return json({ error: (err as Error).message }, 502);
    }
  },
};
