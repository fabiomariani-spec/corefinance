"use client";

/**
 * CurrencyInput — campo monetário com máscara BRL em tempo real.
 *
 * Comportamento "caixa eletrônico":
 *   1 → R$ 0,01 | 10 → R$ 0,10 | 100 → R$ 1,00 | 10000 → R$ 100,00
 *   10000000 → R$ 100.000,00   (cada dígito empurra os anteriores para a esquerda)
 *
 * Backspace remove o último dígito.
 * Cole de valores formatados (ex: "1.500,50") também funciona corretamente.
 */

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface CurrencyInputProps {
  /** Valor numérico atual (ex: 1500.50) */
  value: number;
  /** Callback chamado com o novo valor numérico */
  onChange: (value: number) => void;
  /** Classes extras aplicadas ao <input> (modo padrão) ou wrapper (modo compact) */
  className?: string;
  /** Modo compacto para edições inline — sem label R$, menor altura */
  compact?: boolean;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  id?: string;
  required?: boolean;
}

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function CurrencyInput({
  value,
  onChange,
  className,
  compact = false,
  autoFocus,
  onKeyDown,
  placeholder = "0,00",
  id,
  required,
}: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState(() => {
    const cents = Math.round(value * 100);
    return cents > 0 ? formatBRL(cents) : "";
  });

  // Evita que o useEffect sobrescreva o display após o próprio onChange
  const skipSync = useRef(false);

  useEffect(() => {
    if (skipSync.current) {
      skipSync.current = false;
      return;
    }
    const cents = Math.round(value * 100);
    setDisplayValue(cents > 0 ? formatBRL(cents) : "");
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Extrai somente dígitos do que o browser entregou (ignora pontos, vírgulas, etc.)
    const digits = e.target.value.replace(/\D/g, "").slice(-13); // máx ~99 bi
    const cents = parseInt(digits || "0", 10);
    const reais = cents / 100;

    skipSync.current = true;
    setDisplayValue(cents > 0 ? formatBRL(cents) : "");
    onChange(reais);
  }

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    // Seleciona tudo ao entrar no campo (facilita substituição)
    e.target.select();
  }

  // ── Modo compacto (edições inline em cards) ──────────────────────────────
  if (compact) {
    return (
      <div className="relative inline-flex items-center">
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-zinc-500 text-xs pointer-events-none select-none">
          R$
        </span>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          autoFocus={autoFocus}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={cn(
            "rounded border border-zinc-700 bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-500",
            "focus:outline-none focus:ring-1 focus:ring-indigo-500",
            "h-6 pl-6 pr-2 text-xs w-28",
            className
          )}
        />
      </div>
    );
  }

  // ── Modo padrão (formulários em modais) ──────────────────────────────────
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm pointer-events-none select-none">
        R$
      </span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        required={required}
        className={cn(
          "flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-800/50",
          "pl-9 pr-3 py-2 text-sm text-zinc-100",
          "placeholder:text-zinc-500 ring-offset-zinc-950",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      />
    </div>
  );
}
