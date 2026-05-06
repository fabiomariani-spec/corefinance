"use client";

/**
 * DateRangePicker — componente compartilhado de filtro por intervalo de datas.
 *
 * Era um bloco duplicado inline na página de Lançamentos. Extraí pra cá pra
 * reusar em Fluxo de Caixa, Relatórios, etc. (princípio DRY/POO).
 *
 * Uso:
 *   const [from, setFrom] = useState("");
 *   const [to, setTo] = useState("");
 *   <DateRangePicker
 *     from={from}
 *     to={to}
 *     onChange={(f, t) => { setFrom(f); setTo(t); }}
 *   />
 */
import { useState } from "react";
import { CalendarRange, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toDateStr } from "@/lib/dates";
import { useClickOutside } from "@/lib/use-click-outside";

function fmtDisplayDate(iso: string): string {
  if (!iso) return "";
  const [y, m, day] = iso.split("-");
  return `${day}/${m}/${y}`;
}

type Preset = {
  label: string;
  from: string;
  to: string;
};

function buildDefaultPresets(): Preset[] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  return [
    { label: "Este mês",      from: toDateStr(new Date(y, m, 1)),       to: toDateStr(new Date(y, m + 1, 0)) },
    { label: "Mês passado",   from: toDateStr(new Date(y, m - 1, 1)),   to: toDateStr(new Date(y, m, 0)) },
    { label: "Próx. 30 dias", from: toDateStr(now),                     to: toDateStr(new Date(y, m, d + 30)) },
    { label: "Próx. 3 meses", from: toDateStr(now),                     to: toDateStr(new Date(y, m + 3, 0)) },
    { label: "Este ano",      from: toDateStr(new Date(y, 0, 1)),       to: toDateStr(new Date(y, 11, 31)) },
    { label: "Todos",         from: "",                                 to: "" },
  ];
}

interface DateRangePickerProps {
  /** Data inicial no formato "YYYY-MM-DD" ou string vazia */
  from: string;
  /** Data final no formato "YYYY-MM-DD" ou string vazia */
  to: string;
  /** Callback disparado quando o usuário altera from ou to */
  onChange: (from: string, to: string) => void;
  /** Presets customizados (opcional — default: Este mês, Mês passado, etc.) */
  presets?: Preset[];
  /** Texto quando `from` está vazio (default: "Início") */
  fromPlaceholder?: string;
  /** Texto quando `to` está vazio (default: "Fim") */
  toPlaceholder?: string;
  /** className extra no trigger */
  className?: string;
  /**
   * Renderiza chips horizontais SEMPRE VISÍVEIS ao lado do trigger com presets
   * curtos (Este mês, Mês passado, Próx. 30d, Próx. 3m). Reduz cliques quando
   * o usuário quer um intervalo comum sem abrir o dropdown.
   */
  quickPresets?: boolean;
}

const QUICK_PRESET_DEFS: Array<{ label: string; build: (now: Date) => { from: string; to: string } }> = [
  {
    label: "Este mês",
    build: (now) => ({
      from: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: toDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    }),
  },
  {
    label: "Mês passado",
    build: (now) => ({
      from: toDateStr(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: toDateStr(new Date(now.getFullYear(), now.getMonth(), 0)),
    }),
  },
  {
    label: "Próx. 30d",
    build: (now) => ({
      from: toDateStr(now),
      to: toDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30)),
    }),
  },
  {
    label: "Próx. 3m",
    build: (now) => ({
      from: toDateStr(now),
      to: toDateStr(new Date(now.getFullYear(), now.getMonth() + 3, 0)),
    }),
  },
];

export function DateRangePicker({
  from,
  to,
  onChange,
  presets,
  fromPlaceholder = "Início",
  toPlaceholder = "Fim",
  className = "",
  quickPresets = false,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));

  const allPresets = presets ?? buildDefaultPresets();

  const quickPresetItems = quickPresets
    ? QUICK_PRESET_DEFS.map((p) => ({ label: p.label, ...p.build(new Date()) }))
    : [];

  const isPresetActive = (pf: string, pt: string) => pf === from && pt === to;

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 h-10 px-3 rounded-md border border-zinc-700 bg-zinc-900 text-sm text-zinc-200 hover:border-zinc-500 transition-colors whitespace-nowrap"
        >
          <CalendarRange className="w-4 h-4 text-zinc-400 shrink-0" />
          <span>{from ? fmtDisplayDate(from) : fromPlaceholder}</span>
          <span className="text-zinc-600">→</span>
          <span>{to ? fmtDisplayDate(to) : toPlaceholder}</span>
          <ChevronDown className="w-3.5 h-3.5 text-zinc-500 ml-1" />
        </button>

        {open && (
        <div className="absolute top-12 left-0 z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl p-4 w-72 space-y-4">
          <div className="grid grid-cols-2 gap-1.5">
            {allPresets.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => {
                  onChange(opt.from, opt.to);
                  setOpen(false);
                }}
                className="px-2 py-1.5 text-xs rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors text-left"
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="border-t border-zinc-800 pt-3 space-y-2">
            <p className="text-xs text-zinc-500 font-medium">Intervalo personalizado</p>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-xs text-zinc-500 mb-1 block">De</label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => onChange(e.target.value, to)}
                  className="w-full h-8 px-2 text-xs rounded-md border border-zinc-700 bg-zinc-800 text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-zinc-500 mb-1 block">Até</label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => onChange(from, e.target.value)}
                  className="w-full h-8 px-2 text-xs rounded-md border border-zinc-700 bg-zinc-800 text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
            <Button size="sm" className="w-full h-8 text-xs mt-1" onClick={() => setOpen(false)}>
              Aplicar
            </Button>
          </div>
        </div>
        )}
      </div>

      {quickPresets && quickPresetItems.map((p) => {
        const active = isPresetActive(p.from, p.to);
        return (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange(p.from, p.to)}
            className={`h-8 px-3 text-xs rounded-full border transition-colors whitespace-nowrap ${
              active
                ? "bg-indigo-600/20 text-indigo-300 border-indigo-600/40"
                : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700"
            }`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
