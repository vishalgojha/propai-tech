export function createDedupe() {
  const ttl = Number(process.env.DEDUPE_TTL_MS || 600000);
  const seenMap = new Map<string, number>();

  function cleanup() {
    const now = Date.now();
    for (const [key, ts] of seenMap.entries()) {
      if (now - ts > ttl) seenMap.delete(key);
    }
  }

  return {
    seen(id: string) {
      cleanup();
      if (seenMap.has(id)) return true;
      seenMap.set(id, Date.now());
      return false;
    }
  };
}
