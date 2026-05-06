"use client";

/**
 * SearchableSelect — combobox com filtro por texto.
 *
 * Substitui o `Select` do shadcn quando a lista de opções é grande o suficiente
 * pra valer a pena ter busca (ex: lista de colaboradores).
 *
 * Match é accent-insensitive — "joao" encontra "João".
 *
 * Uso:
 *   <SearchableSelect
 *     value={employeeId}
 *     onChange={setEmployeeId}
 *     options={employees.map(e => ({ value: e.id, label: e.name }))}
 *     placeholder="Selecionar colaborador..."
 *     allowEmpty                          // mostra "— Nenhum —"
 *   />
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Search, Check, X } from "lucide-react";
import { useClickOutside } from "@/lib/use-click-outside";
import { normalizeForSearch } from "@/lib/normalize";

export interface SearchableOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  /** Mostra um item "— Nenhum —" no topo (devolve string vazia ao selecionar) */
  allowEmpty?: boolean;
  /** Texto da opção vazia */
  emptyLabel?: string;
  /** className extra no trigger */
  className?: string;
  /** Desabilita o componente */
  disabled?: boolean;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Selecionar...",
  allowEmpty = false,
  emptyLabel = "— Nenhum —",
  className = "",
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const ref = useClickOutside<HTMLDivElement>(open, () => {
    setOpen(false);
    setQuery("");
  });

  // Auto-focus search input on open
  useEffect(() => {
    if (open) {
      // setTimeout to wait for DOM render
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!query) return options;
    const q = normalizeForSearch(query);
    return options.filter((opt) => normalizeForSearch(opt.label).includes(q));
  }, [query, options]);

  const selected = options.find((opt) => opt.value === value);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={`flex h-9 w-full items-center justify-between rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-200 hover:border-zinc-500 transition-colors ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span className={selected ? "text-zinc-100" : "text-zinc-500"}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0 ml-2" />
      </button>

      {open && (
        <div className="absolute top-10 left-0 right-0 z-50 bg-zinc-900 border border-zinc-700 rounded-md shadow-xl overflow-hidden">
          <div className="relative border-b border-zinc-800">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Pesquisar..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-9 pl-8 pr-8 text-sm bg-transparent text-zinc-100 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {allowEmpty && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center justify-between px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800"
              >
                <span>{emptyLabel}</span>
                {value === "" && <Check className="w-3.5 h-3.5 text-indigo-400" />}
              </button>
            )}
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-zinc-500 text-center">
                Nenhum resultado para &ldquo;{query}&rdquo;
              </div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-zinc-800 ${value === opt.value ? "text-indigo-300" : "text-zinc-200"}`}
                >
                  <span className="truncate">{opt.label}</span>
                  {value === opt.value && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0 ml-2" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
