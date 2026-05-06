"use client";

/**
 * CurrencyInput — campo monetário com máscara BRL em tempo real.
 *
 * Comportamento "caixa eletrônico" (digitação numérica simples):
 *   1 → R$ 0,01 | 10 → R$ 0,10 | 100 → R$ 1,00 | 10000 → R$ 100,00
 *
 * Atalhos & formatos avançados (parseados ao perder foco / Enter / Tab):
 *   - Sufixos: "1k" → 1000   "2.5k" → 2500   "1m" → 1000000   "3M" → 3000000
 *   - BR/US:   "1500,50" e "1500.50" → 1500.50
 *   - Cole:    "R$ 1.234,56" → 1234.56
 *   - Equação: "200+50" → 250   "100*3" → 300   "(10+5)*2" → 30
 *     (apenas + - * / e parênteses; se inválido, mantém valor anterior)
 *
 * Backspace remove o último dígito (modo caixa).
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
  /** Callback adicional disparado no blur (após commit do smart mode) */
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
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

/**
 * Tenta interpretar uma string "esperta" e converte em valor numérico (reais).
 * Retorna `null` se não conseguir.
 *
 * Suporta:
 *   - Sufixos k/m (case-insensitive): "1k", "2.5k", "3M"
 *   - Equações simples (+ - * / parênteses): "200+50", "(10+5)*2"
 *   - Formatos BR (vírgula decimal, ponto milhar) e US (ponto decimal)
 *   - Strings com R$, espaços, etc.
 */
function parseSmart(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1) Sufixo k / m (ex: "1k", "2.5k", "1m", "3M")
  //    Permite vírgula ou ponto como decimal antes do sufixo.
  const suffixMatch = trimmed.match(/^([\d.,]+)\s*([kKmM])$/);
  if (suffixMatch) {
    const numStr = suffixMatch[1];
    const suffix = suffixMatch[2].toLowerCase();
    const num = parseDecimal(numStr);
    if (num === null) return null;
    return suffix === "k" ? num * 1000 : num * 1_000_000;
  }

  // 2) Equação aritmética simples — apenas dígitos, espaços e operadores seguros.
  //    Aceita ponto e vírgula como decimal (vírgula é normalizada para ponto).
  if (/^[\d\s+\-*/().,]+$/.test(trimmed) && /[+\-*/]/.test(trimmed)) {
    // Normaliza vírgula para ponto (interpretação como decimal).
    // Cuidado: "1.234,56+10" precisa virar "1234.56+10".
    // Heurística: se a string contém "," e ".", o ponto é milhar; remove ponto, troca vírgula por ponto.
    // Caso contrário (só vírgula), troca vírgula por ponto.
    let sanitized = trimmed.replace(/\s+/g, "");
    if (sanitized.includes(",") && sanitized.includes(".")) {
      sanitized = sanitized.replace(/\./g, "").replace(/,/g, ".");
    } else {
      sanitized = sanitized.replace(/,/g, ".");
    }
    // Validação extra: depois da sanitização, garante apenas chars seguros.
    if (!/^[\d+\-*/().]+$/.test(sanitized)) return null;
    try {
      const fn = new Function(`"use strict"; return (${sanitized});`);
      const result = fn();
      if (typeof result === "number" && Number.isFinite(result) && result >= 0) {
        return result;
      }
      return null;
    } catch {
      return null;
    }
  }

  // 3) Número puro (com R$, espaços, separadores) — BR ou US.
  return parseDecimal(trimmed);
}

/**
 * Converte string numérica em número, tolerando R$, espaços, ponto/vírgula.
 * Heurística:
 *   - "1.234,56" (BR) → 1234.56
 *   - "1,234.56" (US) → 1234.56
 *   - "1500,50"       → 1500.50
 *   - "1500.50"       → 1500.50
 *   - "1500"          → 1500
 */
function parseDecimal(raw: string): number | null {
  let s = raw.replace(/R\$/gi, "").replace(/\s+/g, "").trim();
  if (!s) return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // Quem está mais à direita é o decimal.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      // BR: ponto = milhar, vírgula = decimal
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // US: vírgula = milhar, ponto = decimal
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Só vírgula — assumir decimal BR.
    s = s.replace(",", ".");
  }
  // Só ponto ou nenhum separador → mantém como está.

  const n = parseFloat(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function CurrencyInput({
  value,
  onChange,
  className,
  compact = false,
  autoFocus,
  onKeyDown,
  onBlur,
  placeholder,
  id,
  required,
}: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState(() => {
    const cents = Math.round(value * 100);
    return cents > 0 ? formatBRL(cents) : "";
  });

  // Modo edição livre (sufixos / equações) — ativa ao digitar caractere não-numérico.
  const [smartMode, setSmartMode] = useState(false);
  const [smartError, setSmartError] = useState(false);

  // Evita que o useEffect sobrescreva o display após o próprio onChange
  const skipSync = useRef(false);

  useEffect(() => {
    if (skipSync.current) {
      skipSync.current = false;
      return;
    }
    const cents = Math.round(value * 100);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync displayValue with value prop
    setDisplayValue(cents > 0 ? formatBRL(cents) : "");
    setSmartMode(false);
    setSmartError(false);
  }, [value]);

  function commitSmart(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      skipSync.current = true;
      setDisplayValue("");
      setSmartMode(false);
      setSmartError(false);
      onChange(0);
      return;
    }
    const parsed = parseSmart(trimmed);
    if (parsed === null) {
      // Inválido: mantém valor anterior, sinaliza erro brevemente.
      setSmartError(true);
      const cents = Math.round(value * 100);
      setDisplayValue(cents > 0 ? formatBRL(cents) : "");
      setSmartMode(false);
      return;
    }
    skipSync.current = true;
    const cents = Math.round(parsed * 100);
    setDisplayValue(cents > 0 ? formatBRL(cents) : "");
    setSmartMode(false);
    setSmartError(false);
    onChange(parsed);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setSmartError(false);

    // Se contém qualquer caractere não-numérico além de separadores típicos do
    // modo caixa (ponto/vírgula auto-inseridos pela máscara), entra em modo livre.
    const hasSmartChar = /[a-zA-Z+\-*/()]/.test(raw);

    if (hasSmartChar || smartMode) {
      // Modo livre: usuário digita texto cru; parseamos só ao confirmar.
      setSmartMode(true);
      setDisplayValue(raw);
      return;
    }

    // Modo caixa eletrônico (default): só dígitos contam.
    const digits = raw.replace(/\D/g, "").slice(-13); // máx ~99 bi
    const cents = parseInt(digits || "0", 10);
    const reais = cents / 100;

    skipSync.current = true;
    setDisplayValue(cents > 0 ? formatBRL(cents) : "");
    onChange(reais);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (smartMode && (e.key === "Enter" || e.key === "Tab")) {
      // Confirma o valor smart antes de propagar Enter/Tab.
      commitSmart(displayValue);
      // Não previne o Tab — só queremos confirmar antes de sair.
    }
    onKeyDown?.(e);
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    if (smartMode) commitSmart(displayValue);
    onBlur?.(e);
  }

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.target.select();
  }

  // Placeholder adaptativo: quando vazio (valor 0), mostra dica "1500 ou 1k+200".
  const effectivePlaceholder =
    placeholder ?? (value === 0 ? "1500 ou 1k+200" : "0,00");

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
          inputMode={smartMode ? "text" : "numeric"}
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          autoFocus={autoFocus}
          onKeyDown={handleKeyDown}
          placeholder={effectivePlaceholder}
          className={cn(
            "rounded border bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-500",
            "focus:outline-none focus:ring-1",
            smartError
              ? "border-amber-500 focus:ring-amber-500"
              : "border-zinc-700 focus:ring-indigo-500",
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
        inputMode={smartMode ? "text" : "numeric"}
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        autoFocus={autoFocus}
        onKeyDown={handleKeyDown}
        placeholder={effectivePlaceholder}
        required={required}
        className={cn(
          "flex h-9 w-full rounded-md border bg-zinc-800/50",
          "pl-9 pr-3 py-2 text-sm text-zinc-100",
          "placeholder:text-zinc-500 ring-offset-zinc-950",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          smartError
            ? "border-amber-500 focus-visible:ring-amber-500"
            : "border-zinc-700 focus-visible:ring-indigo-500",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      />
    </div>
  );
}
