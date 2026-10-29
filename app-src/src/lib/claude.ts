// Thin helpers over the artifact runtime (window.claude.use). Every capability may be absent.

declare global {
  interface Window { claude?: { use(name: string): Promise<any> } }
}

const cache = new Map<string, Promise<any>>();

export function cap<T = any>(name: string, timeoutMs = 6000): Promise<T | null> {
  if (!cache.has(name)) {
    const p = (async () => {
      try {
        if (!window.claude?.use) return null;
        return await Promise.race([
          window.claude.use(name),
          new Promise(r => setTimeout(() => r(null), timeoutMs)),
        ]);
      } catch {
        return null;
      }
    })();
    cache.set(name, p);
  }
  return cache.get(name)!;
}

export const DASHBOARD_URL = 'https://claude.ai/artifact/PgTTWVJFRYLjcWH3ardPpX';
