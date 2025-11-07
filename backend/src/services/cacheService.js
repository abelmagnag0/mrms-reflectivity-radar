// Placeholder cache service. Final implementation will provide in-memory caching.

const cacheStore = new Map();

export function setCache(key, value, ttlMs) {
  const expiresAt = Date.now() + ttlMs;
  cacheStore.set(key, { value, expiresAt });
}

export function getCache(key) {
  const entry = cacheStore.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    cacheStore.delete(key);
    return null;
  }

  return entry.value;
}

export function clearCache(key) {
  cacheStore.delete(key);
}

export function resetCache() {
  cacheStore.clear();
}
