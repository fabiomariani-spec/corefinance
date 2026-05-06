"use client";

/**
 * cachedFetch — fetch com cache em sessionStorage.
 *
 * Pra dados que mudam pouco (lista de departamentos, colaboradores, categorias)
 * mas são solicitados em várias páginas. Reduz "lag" perceptível ao trocar de
 * rota — em vez de esperar 2-3s pra cada dropdown popular, retorna instantâneo
 * do cache enquanto revalida em background (stale-while-revalidate).
 *
 * Uso:
 *   const data = await cachedFetch("/api/departments", { ttl: 5 * 60_000 });
 *
 * Revalidação: se o cache expirou, refaz a request. Se o user quer forçar,
 * passar `bypass: true`.
 */

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

interface Options {
  /** Tempo em ms até o cache expirar. Default 5 minutos. */
  ttl?: number;
  /** Ignora o cache e refaz a request. */
  bypass?: boolean;
  /** Stale-while-revalidate: retorna cache mesmo expirado e revalida em background. */
  swr?: boolean;
}

const KEY_PREFIX = "core-finance:cache:";

function readCache(key: string): CacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

function writeCache(key: string, entry: CacheEntry): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY_PREFIX + key, JSON.stringify(entry));
  } catch {
    // sessionStorage cheio ou bloqueado — silencioso
  }
}

export async function cachedFetch<T = unknown>(
  url: string,
  options: Options = {}
): Promise<T> {
  const { ttl = 5 * 60_000, bypass = false, swr = true } = options;
  const now = Date.now();

  if (!bypass) {
    const cached = readCache(url);
    if (cached) {
      const isFresh = cached.expiresAt > now;
      if (isFresh) return cached.data as T;
      if (swr) {
        // Retorna cache stale e dispara refresh em background
        fetch(url)
          .then((r) => r.json())
          .then((data) => writeCache(url, { data, expiresAt: now + ttl }))
          .catch(() => {});
        return cached.data as T;
      }
    }
  }

  const res = await fetch(url);
  const data = (await res.json()) as T;
  writeCache(url, { data, expiresAt: now + ttl });
  return data;
}

/**
 * Invalida uma chave do cache (útil após mutations que alteram a lista).
 */
export function invalidateCache(url: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(KEY_PREFIX + url);
  } catch {
    // ignore
  }
}
