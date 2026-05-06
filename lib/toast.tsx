"use client";

/**
 * Sistema de toast com undo.
 *
 * Por que existe:
 *   Ações reversíveis (delete, marcar pago) usavam ConfirmDialog — 2 cliques +
 *   perda de contexto. UX research é claro: "error prevention > error
 *   confirmation". Toast com undo dá feedback imediato + janela curta pra
 *   reverter. Sem libs externas, mínimo, dark-themed.
 *
 * API:
 *   const toast = useToast();
 *   toast.success("Lançamento excluído", { undo: () => recreate() });
 *   toast.error("Erro ao salvar");
 *   toast.info("Conta arquivada", { durationMs: 8000 });
 *
 * Comportamento:
 *   - Auto-dismiss em 5s (configurável via durationMs)
 *   - Stack vertical bottom-right, máx 3 visíveis simultâneas
 *   - Undo só aparece se passar { undo } — clicar dispara o callback e fecha
 *   - Hover pausa o auto-dismiss (intent: usuário tá lendo/decidindo)
 *
 * Onde montar:
 *   <Toaster /> uma vez no layout raiz (já tá em (dashboard)/layout.tsx).
 */

import * as React from "react";
import { CheckCircle2, AlertCircle, Info, Undo2, X } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type ToastVariant = "success" | "error" | "info";

interface ToastOptions {
  /** Callback invocado quando o usuário clica "Desfazer". Toast fecha sozinho ao clicar. */
  undo?: () => void;
  /** Tempo até auto-dismiss em ms. Default: 5000. */
  durationMs?: number;
}

interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
  undo?: () => void;
  durationMs: number;
  /** timestamp de quando começou a contar (pra calcular o progresso da barra) */
  createdAt: number;
}

interface ToastApi {
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
  /** dismiss programático (raro — geralmente o auto-dismiss resolve) */
  dismiss: (id: string) => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ToastContext = React.createContext<ToastApi | null>(null);

/**
 * Stack global. Vive fora do React pra que `toast.success(...)` funcione
 * de qualquer lugar (não só dentro de um Provider). O <Toaster /> abaixo
 * faz subscribe e re-renderiza quando muda.
 */
type Listener = (items: ToastItem[]) => void;
const listeners = new Set<Listener>();
let stack: ToastItem[] = [];

const MAX_VISIBLE = 3;

function emit() {
  // Mantém sempre só os 3 mais recentes visíveis (sobreescreve os antigos)
  const visible = stack.slice(-MAX_VISIBLE);
  for (const l of listeners) l(visible);
}

function nextId(): string {
  // Math.random é suficiente — colisão é praticamente impossível em janelas curtas
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function push(variant: ToastVariant, message: string, options?: ToastOptions) {
  const item: ToastItem = {
    id: nextId(),
    variant,
    message,
    undo: options?.undo,
    durationMs: options?.durationMs ?? 5000,
    createdAt: Date.now(),
  };
  stack = [...stack, item];
  emit();
}

function remove(id: string) {
  stack = stack.filter((t) => t.id !== id);
  emit();
}

/**
 * API global — pode ser importada e usada fora de componentes React
 * (ex: dentro de uma function async qualquer).
 */
export const toast: ToastApi = {
  success: (m, o) => push("success", m, o),
  error: (m, o) => push("error", m, o),
  info: (m, o) => push("info", m, o),
  dismiss: (id) => remove(id),
};

/** Hook de conveniência — retorna a mesma API global. */
export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext);
  return ctx ?? toast;
}

// ─── ToastProvider (opcional — só pra quem quer wrap explícito) ─────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <ToastContext.Provider value={toast}>
      {children}
    </ToastContext.Provider>
  );
}

// ─── Toaster (visual) ────────────────────────────────────────────────────────

const VARIANT_STYLES: Record<ToastVariant, { icon: React.ComponentType<{ className?: string }>; iconClass: string; barClass: string }> = {
  success: {
    icon: CheckCircle2,
    iconClass: "text-emerald-400",
    barClass: "bg-emerald-500/60",
  },
  error: {
    icon: AlertCircle,
    iconClass: "text-red-400",
    barClass: "bg-red-500/60",
  },
  info: {
    icon: Info,
    iconClass: "text-indigo-400",
    barClass: "bg-indigo-500/60",
  },
};

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const { icon: Icon, iconClass, barClass } = VARIANT_STYLES[item.variant];
  const [hovering, setHovering] = React.useState(false);
  // Progress bar — vai de 100% até 0 ao longo da vida do toast.
  const [progress, setProgress] = React.useState(100);

  // Auto-dismiss + countdown da barra. Pausa em hover (usuário tá lendo).
  React.useEffect(() => {
    if (hovering) return;
    const start = Date.now();
    // Calcula quanto tempo já passou desde a criação (relevante quando o toast
    // já existia antes do hover). Isso preserva o tempo decorrido.
    const elapsedAtMount = start - item.createdAt;
    const remaining = Math.max(0, item.durationMs - elapsedAtMount);

    const interval = setInterval(() => {
      const passed = Date.now() - item.createdAt;
      const pct = Math.max(0, 100 - (passed / item.durationMs) * 100);
      setProgress(pct);
    }, 50);

    const timer = setTimeout(() => onDismiss(item.id), remaining);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [hovering, item.id, item.durationMs, item.createdAt, onDismiss]);

  function handleUndo() {
    item.undo?.();
    onDismiss(item.id);
  }

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className="pointer-events-auto relative flex items-center gap-3 min-w-[300px] max-w-[420px] bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl shadow-black/40 px-4 py-3 overflow-hidden animate-in slide-in-from-right-4 fade-in duration-200"
    >
      <Icon className={`w-4 h-4 shrink-0 ${iconClass}`} />
      <p className="flex-1 text-sm text-zinc-100 leading-snug">{item.message}</p>

      {item.undo && (
        <button
          type="button"
          onClick={handleUndo}
          className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300 px-2 py-1 -mr-1 rounded-md hover:bg-indigo-500/10 transition-colors"
          title="Desfazer"
        >
          <Undo2 className="w-3 h-3" />
          Desfazer
        </button>
      )}

      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        className="shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors"
        title="Fechar"
        aria-label="Fechar notificação"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {/* Progress bar — visualiza o countdown. Some em hover (pausa). */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-800/60">
        <div
          className={`h-full transition-[width] ease-linear ${barClass}`}
          style={{
            width: hovering ? "100%" : `${progress}%`,
            transitionDuration: hovering ? "200ms" : "50ms",
          }}
        />
      </div>
    </div>
  );
}

export function Toaster() {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  React.useEffect(() => {
    const listener: Listener = (next) => setItems(next);
    listeners.add(listener);
    // Sincroniza estado inicial caso já exista algo no stack
    listener(stack.slice(-MAX_VISIBLE));
    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none"
      aria-label="Notificações"
    >
      {items.map((item) => (
        <ToastCard key={item.id} item={item} onDismiss={remove} />
      ))}
    </div>
  );
}
