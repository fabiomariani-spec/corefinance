"use client";

import { useEffect, useRef } from "react";

/**
 * useClickOutside — fecha popovers/dropdowns ao clicar fora do elemento.
 *
 * Padrão extraído pra DRY: 6+ implementações repetidas com pequenas variações.
 * Listener é mousedown (não click) — fecha antes do próximo focus rodar, evita
 * race condition com elementos clicáveis dentro do popover.
 *
 * Uso:
 *   const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));
 *   return open ? <div ref={ref}>...</div> : null;
 *
 * Quando `enabled` é false (popover fechado), o listener nem é registrado —
 * zero overhead em estado idle.
 */
export function useClickOutside<T extends HTMLElement = HTMLElement>(
  enabled: boolean,
  onOutsideClick: () => void
) {
  const ref = useRef<T | null>(null);
  // Mantém o callback fresco sem precisar resetar o listener a cada render.
  const cbRef = useRef(onOutsideClick);
  useEffect(() => {
    cbRef.current = onOutsideClick;
  }, [onOutsideClick]);

  useEffect(() => {
    if (!enabled) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        cbRef.current();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [enabled]);

  return ref;
}
