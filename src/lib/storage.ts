// Local persistence layer: Home address, recent destinations, and a TTL cache
// for Nominatim search results. All client-side, no login required.

import type { SearchResult } from "./navigation";

const HOME_KEY = "wayflow.home";
const RECENTS_KEY = "wayflow.recents";
const SEARCH_CACHE_KEY = "wayflow.searchCache";
const RECENTS_MAX = 20;
const CACHE_MAX = 80;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

const safeRead = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const safeWrite = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private mode — ignore */
  }
};

// ---------- Home ----------
export const getHome = (): SearchResult | null => safeRead<SearchResult | null>(HOME_KEY, null);
export const setHome = (place: SearchResult | null) => {
  if (place) safeWrite(HOME_KEY, place);
  else localStorage.removeItem(HOME_KEY);
};

// ---------- Recents ----------
export const getRecents = (): SearchResult[] => safeRead<SearchResult[]>(RECENTS_KEY, []);

export const addRecent = (place: SearchResult) => {
  const existing = getRecents().filter((r) => r.id !== place.id);
  const next = [place, ...existing].slice(0, RECENTS_MAX);
  safeWrite(RECENTS_KEY, next);
};

export const clearRecents = () => localStorage.removeItem(RECENTS_KEY);

// ---------- Search cache (TTL keyed by normalized query + viewport bias) ----------
interface CacheEntry {
  results: SearchResult[];
  ts: number;
}

const normalize = (q: string) => q.trim().toLowerCase().replace(/\s+/g, " ");

const readCache = (): Record<string, CacheEntry> =>
  safeRead<Record<string, CacheEntry>>(SEARCH_CACHE_KEY, {});

const writeCache = (cache: Record<string, CacheEntry>) => {
  // Evict oldest if over cap
  const entries = Object.entries(cache);
  if (entries.length > CACHE_MAX) {
    entries.sort((a, b) => b[1].ts - a[1].ts);
    cache = Object.fromEntries(entries.slice(0, CACHE_MAX));
  }
  safeWrite(SEARCH_CACHE_KEY, cache);
};

export const getCachedSearch = (
  query: string,
  biasKey: string,
): SearchResult[] | null => {
  const cache = readCache();
  const key = `${biasKey}|${normalize(query)}`;
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
  return entry.results;
};

export const setCachedSearch = (
  query: string,
  biasKey: string,
  results: SearchResult[],
) => {
  const cache = readCache();
  const key = `${biasKey}|${normalize(query)}`;
  cache[key] = { results, ts: Date.now() };
  writeCache(cache);
};
