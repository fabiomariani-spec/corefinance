import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * EmptyState — CTA pattern para empty states (Lei de UX: Postel/Doherty).
 *
 * Em vez de mostrar "Nenhum X encontrado" e deixar o user travado, esse
 * componente ensina o que fazer: ícone grande + heading + descrição + ação
 * primária. Use em qualquer lista/tabela vazia.
 *
 * Padrão visual: tema dark zinc/indigo, ícone redondo, descrição curta.
 */
export interface EmptyStateProps {
  /** Ícone (lucide). Renderizado em w-8 h-8 dentro de um círculo zinc-800. */
  icon: LucideIcon;
  /** Heading curto (3–6 palavras). Ex: "Sem contas bancárias". */
  title: string;
  /** Descrição curta (1 frase). Ex: "Cadastre suas contas pra acompanhar saldos." */
  description?: React.ReactNode;
  /** Texto do CTA. Se omitido, nenhum botão aparece. */
  actionLabel?: React.ReactNode;
  /** Handler do CTA. */
  onAction?: () => void;
  /** Variante do botão. */
  actionVariant?: "default" | "outline" | "secondary";
  /** Conteúdo extra (ex: 2º botão, link secundário). Renderizado após o CTA. */
  children?: React.ReactNode;
  /** Override de classes do wrapper. */
  className?: string;
  /** Tamanho do padding vertical. Default: lg. */
  size?: "sm" | "md" | "lg";
}

const PADDING: Record<NonNullable<EmptyStateProps["size"]>, string> = {
  sm: "py-10 px-4",
  md: "py-14 px-4",
  lg: "py-16 px-4",
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionVariant = "default",
  children,
  className,
  size = "lg",
}: EmptyStateProps) {
  const buttonClass =
    actionVariant === "outline"
      ? "border border-zinc-700 bg-transparent text-zinc-100 hover:bg-zinc-800"
      : actionVariant === "secondary"
      ? "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
      : "bg-indigo-600 text-white shadow hover:bg-indigo-700 active:scale-95";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        PADDING[size],
        className
      )}
    >
      <div className="w-16 h-16 rounded-full bg-zinc-800/60 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-zinc-500" />
      </div>
      <h3 className="text-base font-semibold text-zinc-200 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-zinc-500 max-w-sm mb-5">{description}</p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className={cn(
            "inline-flex items-center justify-center gap-2 h-9 px-4 rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
            buttonClass
          )}
        >
          {actionLabel}
        </button>
      )}
      {children}
    </div>
  );
}
