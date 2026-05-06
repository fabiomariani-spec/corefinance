"use client";

import { useEffect, useState } from "react";

/**
 * useDebounce — devolve uma versão "debounced" de qualquer valor.
 *
 * Padrão típico: dois states pra busca — o input controlado (immediate) e o
 * valor que dispara o fetch (debounced). Isso evita refetch a cada keystroke.
 *
 * Uso:
 *   const [searchInput, setSearchInput] = useState("");
 *   const search = useDebounce(searchInput, 300);
 *   useEffect(() => { fetchResults(search); }, [search]);
 *
 * Default delay: 300ms — bom pra busca; aumente pra 500-800ms em ações
 * mais caras (ex: gerar relatório, chamar IA).
 */
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}
