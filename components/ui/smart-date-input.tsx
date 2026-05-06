"use client";

/**
 * SmartDateInput — campo de data flexível em PT-BR.
 *
 * Aceita:
 *   - Texto livre: "hoje", "ontem", "amanhã", "+3 dias", "-1 semana", "próx sexta",
 *                  "15/04", "15/04/2026", "2026-04-15"
 *   - Atalhos: +Nd | +N dias | +Nw | +N semanas | +Nm | +N meses
 *   - Calendar nativo via botão lateral
 *
 * Emite ISO `YYYY-MM-DD` no `onChange` — compatível com `<Input type="date">`.
 *
 * Confirma valor em: blur, Tab, Enter.
 * Não reconhece: borda âmbar + tooltip "Não entendi essa data".
 */

import { useState, useEffect, useRef } from "react";
import {
  format,
  addDays,
  addWeeks,
  addMonths,
  parse,
  isValid,
  startOfDay,
  nextMonday,
  nextTuesday,
  nextWednesday,
  nextThursday,
  nextFriday,
  nextSaturday,
  nextSunday,
} from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeForSearch } from "@/lib/normalize";

interface SmartDateInputProps {
  /** ISO `YYYY-MM-DD` ou string vazia. */
  value: string;
  /** Callback com ISO `YYYY-MM-DD` ou string vazia. */
  onChange: (iso: string) => void;
  /** Disparado quando o usuário sai do campo (após commit). */
  onBlur?: () => void;
  /** Ref opcional para o input de texto principal (foco programático). */
  inputRef?: React.RefObject<HTMLInputElement | null>;
  className?: string;
  placeholder?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  /** Marca o input como inválido (borda vermelha). */
  invalid?: boolean;
  /** Quando true, esconde a preview formatada abaixo do input. */
  hidePreview?: boolean;
}

// ── helpers ────────────────────────────────────────────────────────────────

/** ISO `YYYY-MM-DD` → Date local (meio-dia, evita fuso horário antecipando 1 dia). */
function isoToDate(iso: string): Date | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const dt = new Date(parseInt(y), parseInt(mo) - 1, parseInt(d), 12, 0, 0);
  return isValid(dt) ? dt : null;
}

function dateToIso(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

const WEEKDAY_MAP: Record<string, (d: Date) => Date> = {
  segunda: nextMonday,
  seg: nextMonday,
  terca: nextTuesday,
  ter: nextTuesday,
  quarta: nextWednesday,
  qua: nextWednesday,
  quinta: nextThursday,
  qui: nextThursday,
  sexta: nextFriday,
  sex: nextFriday,
  sabado: nextSaturday,
  sab: nextSaturday,
  domingo: nextSunday,
  dom: nextSunday,
};

/**
 * Tenta interpretar um texto livre como data.
 * Retorna `Date` (meio-dia local) ou `null`.
 */
function parseSmartDate(raw: string): Date | null {
  const input = normalizeForSearch(raw).trim();
  if (!input) return null;

  const today = startOfDay(new Date());
  // Mantém meio-dia como referência para evitar drift de fuso.
  const todayNoon = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0);

  // 1) Palavras-chave
  if (input === "hoje" || input === "today") return todayNoon;
  if (input === "ontem" || input === "yesterday") return addDays(todayNoon, -1);
  if (input === "amanha" || input === "amanhã" || input === "tomorrow")
    return addDays(todayNoon, 1);
  if (input === "depois de amanha" || input === "depois de amanhã")
    return addDays(todayNoon, 2);

  // 2) Próx. dia da semana — "prox sexta", "proxima sexta", "próx sexta"
  const weekdayMatch = input.match(/^(?:prox\.?|proxima?)\s+(\w+)$/);
  if (weekdayMatch) {
    const fn = WEEKDAY_MAP[weekdayMatch[1]];
    if (fn) return fn(todayNoon);
  }
  // Permite só o nome do dia ("sexta") como sinônimo de "próxima sexta".
  if (WEEKDAY_MAP[input]) return WEEKDAY_MAP[input](todayNoon);

  // 3) Atalhos com sinal: +3d, -1w, +2 dias, +1 semana, +3 meses…
  //    Aceita d/dia/dias, w/sem/semana/semanas, m/mes/meses.
  const relMatch = input.match(
    /^([+-]?)\s*(\d+)\s*(d|dia|dias|w|sem|semana|semanas|m|mes|meses)$/
  );
  if (relMatch) {
    const sign = relMatch[1] === "-" ? -1 : 1;
    const n = parseInt(relMatch[2], 10) * sign;
    const unit = relMatch[3];
    if (unit.startsWith("d")) return addDays(todayNoon, n);
    if (unit.startsWith("w") || unit.startsWith("sem")) return addWeeks(todayNoon, n);
    if (unit.startsWith("m")) return addMonths(todayNoon, n);
  }

  // 4) "em N dias/semanas/meses" — variação natural
  const emMatch = input.match(/^em\s+(\d+)\s+(dias?|semanas?|meses?|mes)$/);
  if (emMatch) {
    const n = parseInt(emMatch[1], 10);
    const unit = emMatch[2];
    if (unit.startsWith("dia")) return addDays(todayNoon, n);
    if (unit.startsWith("semana")) return addWeeks(todayNoon, n);
    if (unit.startsWith("mes")) return addMonths(todayNoon, n);
  }

  // 5) Formatos de data explícitos.
  //    Tenta cada um e retorna o primeiro que validar.
  const formats = [
    "dd/MM/yyyy",
    "d/M/yyyy",
    "dd/MM/yy",
    "d/M/yy",
    "dd/MM",
    "d/M",
    "dd-MM-yyyy",
    "d-M-yyyy",
    "yyyy-MM-dd",
    "yyyy/MM/dd",
  ];
  for (const fmt of formats) {
    const parsed = parse(raw.trim(), fmt, todayNoon, { locale: ptBR });
    if (isValid(parsed)) {
      // Normaliza para meio-dia local (evita drift de fuso).
      return new Date(
        parsed.getFullYear(),
        parsed.getMonth(),
        parsed.getDate(),
        12,
        0,
        0
      );
    }
  }

  return null;
}

/** Formata a preview "→ Sexta, 02/05/2026". */
function formatPreview(d: Date): string {
  // EEEE = nome completo do dia da semana; capitaliza primeira letra.
  const weekday = format(d, "EEEE", { locale: ptBR });
  const cap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return `${cap}, ${format(d, "dd/MM/yyyy", { locale: ptBR })}`;
}

// ── componente ─────────────────────────────────────────────────────────────

export function SmartDateInput({
  value,
  onChange,
  onBlur,
  inputRef,
  className,
  placeholder = "hoje, +3d, 15/04…",
  id,
  required,
  disabled,
  invalid = false,
  hidePreview = false,
}: SmartDateInputProps) {
  const [text, setText] = useState<string>(() => {
    const d = isoToDate(value);
    return d ? format(d, "dd/MM/yyyy") : "";
  });
  const [previewDate, setPreviewDate] = useState<Date | null>(() => isoToDate(value));
  const [unrecognized, setUnrecognized] = useState(false);
  const nativeRef = useRef<HTMLInputElement>(null);

  // Sincroniza quando `value` muda externamente (ex: reset do form).
  useEffect(() => {
    const d = isoToDate(value);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with parent value
    setText(d ? format(d, "dd/MM/yyyy") : "");
    setPreviewDate(d);
    setUnrecognized(false);
  }, [value]);

  function handleTextChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setText(raw);
    setUnrecognized(false);

    if (!raw.trim()) {
      setPreviewDate(null);
      return;
    }
    // Atualiza preview enquanto digita (sem commitar para o pai ainda).
    const parsed = parseSmartDate(raw);
    setPreviewDate(parsed);
  }

  function commit() {
    if (!text.trim()) {
      setPreviewDate(null);
      setUnrecognized(false);
      onChange("");
      return;
    }
    const parsed = parseSmartDate(text);
    if (!parsed) {
      setUnrecognized(true);
      return;
    }
    const iso = dateToIso(parsed);
    setPreviewDate(parsed);
    setUnrecognized(false);
    // Substitui o texto digitado pelo formato canônico DD/MM/YYYY.
    setText(format(parsed, "dd/MM/yyyy"));
    if (iso !== value) onChange(iso);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Tab") {
      // Não previne — só commita antes de sair do campo.
      commit();
    } else if (e.key === "Escape") {
      // Reverte para o valor atual do pai.
      const d = isoToDate(value);
      setText(d ? format(d, "dd/MM/yyyy") : "");
      setPreviewDate(d);
      setUnrecognized(false);
    }
  }

  function handleNativeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const iso = e.target.value;
    if (!iso) {
      setText("");
      setPreviewDate(null);
      setUnrecognized(false);
      onChange("");
      return;
    }
    const d = isoToDate(iso);
    if (d) {
      setText(format(d, "dd/MM/yyyy"));
      setPreviewDate(d);
      setUnrecognized(false);
      onChange(iso);
    }
  }

  function openNativePicker() {
    if (!nativeRef.current) return;
    // showPicker() é o caminho moderno; fallback para focus()/click().
    try {
      if (typeof nativeRef.current.showPicker === "function") {
        nativeRef.current.showPicker();
        return;
      }
    } catch {
      /* fallback abaixo */
    }
    nativeRef.current.focus();
    nativeRef.current.click();
  }

  return (
    <div className={cn("space-y-1", className)}>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onBlur={() => { commit(); onBlur?.(); }}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          title={unrecognized ? "Não entendi essa data" : undefined}
          aria-invalid={unrecognized || invalid || undefined}
          className={cn(
            "flex h-9 w-full rounded-md border bg-zinc-800/50",
            "pl-3 pr-9 py-2 text-sm text-zinc-100",
            "placeholder:text-zinc-500 ring-offset-zinc-950",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
            invalid
              ? "border-red-500 focus-visible:ring-red-500"
              : unrecognized
                ? "border-amber-500 focus-visible:ring-amber-500"
                : "border-zinc-700 focus-visible:ring-indigo-500 focus-visible:border-indigo-500",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={openNativePicker}
          disabled={disabled}
          aria-label="Abrir calendário"
          className={cn(
            "absolute right-1 top-1/2 -translate-y-1/2",
            "p-1.5 rounded text-zinc-400 hover:text-indigo-400 hover:bg-zinc-700/60",
            "focus:outline-none focus:ring-1 focus:ring-indigo-500",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          <Calendar className="w-4 h-4" />
        </button>
        {/* Native date input — invisível, apenas pra disparar o picker do browser. */}
        <input
          ref={nativeRef}
          type="date"
          value={value}
          onChange={handleNativeChange}
          tabIndex={-1}
          aria-hidden="true"
          className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 opacity-0 pointer-events-none"
        />
      </div>
      {!hidePreview && (
        <div className="min-h-[1.1rem] text-xs leading-tight">
          {unrecognized ? (
            <span className="text-amber-400">Não entendi essa data</span>
          ) : previewDate && text.trim() ? (
            <span className="text-zinc-500">
              <span className="text-zinc-600">→</span>{" "}
              <span className="text-zinc-400">{formatPreview(previewDate)}</span>
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
