"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface InfoTooltipProps {
  /** Texto explicativo (PT-BR, simples, sem jargão financeiro). */
  text: string;
  /** Tamanho do ícone — `sm` (12px) | `md` (14px, default) | `lg` (16px). */
  size?: "sm" | "md" | "lg";
  /** Lado preferido do tooltip (Radix) — default `top`. */
  side?: "top" | "right" | "bottom" | "left";
  /** Largura máxima customizada (default `max-w-xs`). */
  maxWidth?: string;
  /** Classe extra para o botão. */
  className?: string;
  /** Aria label do botão (default: "Mais informações"). */
  ariaLabel?: string;
}

/**
 * Tooltip discreto com ícone Info — uso pra explicar termos técnicos
 * financeiros (Burn rate, Runway, Margem, DRE etc.) em linguagem simples.
 *
 * Acessível: trigger é um <button>, abre on hover/focus (Radix).
 *
 * Exemplo:
 * ```tsx
 * <InfoTooltip text="Velocidade que sua empresa queima caixa por mês." />
 * ```
 */
export function InfoTooltip({
  text,
  size = "md",
  side = "top",
  maxWidth = "max-w-xs",
  className,
  ariaLabel = "Mais informações",
}: InfoTooltipProps) {
  const iconSize =
    size === "sm" ? "w-3 h-3" : size === "lg" ? "w-4 h-4" : "w-3.5 h-3.5";

  return (
    <TooltipPrimitive.Provider delayDuration={150} skipDelayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <button
            type="button"
            aria-label={ariaLabel}
            onClick={(e) => e.preventDefault()}
            className={cn(
              "inline-flex items-center justify-center align-middle",
              "text-zinc-500 hover:text-indigo-400 focus:text-indigo-400",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 rounded-full",
              "transition-colors",
              className
            )}
          >
            <Info className={iconSize} aria-hidden="true" />
          </button>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            collisionPadding={8}
            className={cn(
              "z-[60] rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2",
              "text-xs leading-relaxed text-zinc-200 shadow-xl shadow-black/50",
              "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0",
              "data-[state=closed]:zoom-out-95 data-[state=delayed-open]:zoom-in-95",
              maxWidth
            )}
          >
            {text}
            <TooltipPrimitive.Arrow className="fill-zinc-900 stroke-zinc-700" width={10} height={5} />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export default InfoTooltip;
