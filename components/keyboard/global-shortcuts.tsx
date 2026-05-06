"use client";

/**
 * Global keyboard shortcuts.
 *
 * Mounted once in the dashboard layout. Listens to keydown on document and
 * dispatches custom events (or routes via next/navigation) for each shortcut.
 *
 * Skips when focus is in an input/textarea/contenteditable (except for `?`,
 * which is allowed everywhere so the cheatsheet is always reachable).
 *
 * Custom events used:
 *   - "shortcut:focus-search"        → page-level search inputs listen
 *   - "shortcut:open-new-transaction" → /lancamentos modal listens
 *   - "shortcut:nav-month"           → header listens (detail.dir = -1 | 1)
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

function dispatch(name: string, detail?: unknown) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/**
 * DOM fallback for search-focus when no page listener handled the event.
 * Looks for a marked input first, then any input with a "Buscar" placeholder.
 */
function focusSearchFallback() {
  const marked = document.querySelector<HTMLInputElement>('input[data-shortcut="search"]');
  if (marked) {
    marked.focus();
    marked.select?.();
    return;
  }
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input"));
  const match = inputs.find((i) => /buscar|pesquisar|search/i.test(i.placeholder || ""));
  if (match) {
    match.focus();
    match.select?.();
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGlobalShortcuts(onShowCheatsheet: () => void, onCloseCheatsheet: () => void) {
  const router = useRouter();

  useEffect(() => {
    let gPending = false;
    let gTimer: ReturnType<typeof setTimeout> | null = null;

    function clearG() {
      gPending = false;
      if (gTimer) {
        clearTimeout(gTimer);
        gTimer = null;
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      // Always allow ESC to close cheatsheet (handled in modal too, but safe).
      if (e.key === "Escape") {
        onCloseCheatsheet();
        clearG();
        return;
      }

      const typing = isTypingTarget(e.target);

      // `?` works even while typing? No — only when not typing, except still
      // allow Shift+/ pressed without focus. Keeps things predictable.
      if (!typing && (e.key === "?" || (e.shiftKey && e.key === "/"))) {
        e.preventDefault();
        onShowCheatsheet();
        clearG();
        return;
      }

      // Ctrl+K / Cmd+K — focus search (works even in inputs).
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        dispatch("shortcut:focus-search");
        // Fallback: focus any search-like input on the page after dispatch.
        setTimeout(focusSearchFallback, 0);
        clearG();
        return;
      }

      if (typing) return;

      // Ignore modifier-only combos for the rest.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // `g` chord — vim-style "go to".
      if (gPending) {
        const k = e.key.toLowerCase();
        clearG();
        if (k === "l") {
          e.preventDefault();
          router.push("/lancamentos");
          return;
        }
        if (k === "f") {
          e.preventDefault();
          router.push("/fluxo-caixa");
          return;
        }
        if (k === "p") {
          e.preventDefault();
          router.push("/");
          return;
        }
        return;
      }

      if (e.key === "g") {
        gPending = true;
        gTimer = setTimeout(clearG, 1200);
        return;
      }

      // `/` — focus search.
      if (e.key === "/") {
        e.preventDefault();
        dispatch("shortcut:focus-search");
        // Fallback: focus any search-like input on the page after dispatch.
        setTimeout(focusSearchFallback, 0);
        return;
      }

      // `n` — new transaction (only takes effect on /lancamentos via listener).
      if (e.key === "n" || e.key === "N") {
        // Only honor on /lancamentos to avoid surprises elsewhere.
        if (typeof window !== "undefined" && window.location.pathname.startsWith("/lancamentos")) {
          e.preventDefault();
          dispatch("shortcut:open-new-transaction");
        }
        return;
      }

      // Arrow keys — month navigation on pages with a date header.
      if (e.key === "ArrowLeft") {
        dispatch("shortcut:nav-month", { dir: -1 });
        return;
      }
      if (e.key === "ArrowRight") {
        dispatch("shortcut:nav-month", { dir: 1 });
        return;
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      clearG();
    };
  }, [router, onShowCheatsheet, onCloseCheatsheet]);
}

// ─── Cheatsheet modal ─────────────────────────────────────────────────────────

const SHORTCUTS: Array<{ keys: string[]; label: string; section: string }> = [
  { section: "Busca", keys: ["/"], label: "Foca a busca da página" },
  { section: "Busca", keys: ["Ctrl", "K"], label: "Foca a busca (alternativo)" },
  { section: "Ações", keys: ["N"], label: "Novo lançamento (em /lancamentos)" },
  { section: "Navegação", keys: ["←"], label: "Mês anterior" },
  { section: "Navegação", keys: ["→"], label: "Próximo mês" },
  { section: "Ir para", keys: ["G", "P"], label: "Painel" },
  { section: "Ir para", keys: ["G", "L"], label: "Lançamentos" },
  { section: "Ir para", keys: ["G", "F"], label: "Fluxo de caixa" },
  { section: "Ajuda", keys: ["?"], label: "Mostrar este painel" },
  { section: "Ajuda", keys: ["Esc"], label: "Fechar" },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-md border border-zinc-700 bg-zinc-800/80 text-zinc-100 text-xs font-mono shadow-[0_2px_0_rgba(0,0,0,0.4)]">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Group by section preserving the order above.
  const sections = SHORTCUTS.reduce<Record<string, typeof SHORTCUTS>>((acc, s) => {
    (acc[s.section] ||= []).push(s);
    return acc;
  }, {});

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Atalhos de teclado"
        className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-indigo-950/40 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-gradient-to-r from-indigo-950/40 to-transparent">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Atalhos de teclado</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Mais rápido, sem mouse.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
          {Object.entries(sections).map(([section, items]) => (
            <div key={section} className="mb-5 last:mb-0">
              <h3 className="text-[11px] uppercase tracking-wider text-indigo-400/80 font-semibold mb-2">
                {section}
              </h3>
              <ul className="space-y-1.5">
                {items.map((it, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-4 px-3 py-2 rounded-lg hover:bg-zinc-800/50 transition-colors"
                  >
                    <span className="text-sm text-zinc-300">{it.label}</span>
                    <span className="flex items-center gap-1">
                      {it.keys.map((k, j) => (
                        <span key={j} className="flex items-center gap-1">
                          {j > 0 && <span className="text-zinc-600 text-xs">+</span>}
                          <Kbd>{k}</Kbd>
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-950/50 text-[11px] text-zinc-500">
          Dica: pressione <Kbd>?</Kbd> a qualquer momento pra reabrir.
        </div>
      </div>
    </div>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function KeyboardShortcutsProvider() {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);
  useGlobalShortcuts(show, hide);
  return <KeyboardShortcutsModal open={open} onClose={hide} />;
}
