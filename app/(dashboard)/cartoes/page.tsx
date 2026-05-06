"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { formatCurrency, maskCardNumber } from "@/lib/formatters";
import { CurrencyInput } from "@/components/ui/currency-input";
import { ColorPicker } from "@/components/ui/color-picker";
import { Plus, CreditCard, Pencil, Loader2, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useClickOutside } from "@/lib/use-click-outside";

interface CreditCardData {
  id: string;
  name: string;
  bank: string | null;
  brand: string;
  lastFour: string | null;
  limit: number;
  closingDay: number;
  dueDay: number;
  holder: string | null;
  color: string;
  usedAmount: number;
}

const BRAND_LABELS: Record<string, string> = {
  VISA: "Visa",
  MASTERCARD: "Mastercard",
  AMEX: "Amex",
  ELO: "Elo",
  HIPERCARD: "Hipercard",
  ITAU: "Itaú",
  OTHER: "Outro",
};

/** Detecta a bandeira do cartão a partir dos primeiros dígitos. */
function detectBrand(digits: string): string | null {
  const d = digits.replace(/\D/g, "");
  if (d.length < 4) return null;
  // AMEX: 34 ou 37
  if (/^3[47]/.test(d)) return "AMEX";
  // VISA: 4
  if (/^4/.test(d)) return "VISA";
  // ELO (aproximação): 6011, 65
  if (/^6011/.test(d) || /^65/.test(d)) return "ELO";
  // MASTERCARD: 5 ou 2221-2720
  if (/^5[1-5]/.test(d)) return "MASTERCARD";
  if (/^2/.test(d)) {
    const n = parseInt(d.slice(0, 4), 10);
    if (n >= 2221 && n <= 2720) return "MASTERCARD";
  }
  return null;
}

/** Popover simples com click-outside. */
function InlinePopover({
  open,
  onClose,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useClickOutside<HTMLDivElement>(open, onClose);
  if (!open) return null;
  return (
    <div
      ref={ref}
      className={`absolute z-50 mt-2 rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-xl ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

/** Edição inline de um dia (1-31). */
function DayEditor({
  label,
  value,
  onSave,
  tooltip,
}: {
  label: string;
  value: number;
  onSave: (n: number) => void | Promise<void>;
  tooltip?: string;
}) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(String(value));
  useEffect(() => setVal(String(value)), [value]);

  function commit() {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 1 && n <= 31 && n !== value) {
      onSave(n);
    } else {
      setVal(String(value));
    }
    setOpen(false);
  }

  return (
    <div className="relative">
      <p className="text-xs text-zinc-600 flex items-center gap-1">
        {label}
        {tooltip && <InfoTooltip size="sm" text={tooltip} />}
      </p>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-sm font-medium text-zinc-300 hover:text-indigo-400 transition-colors"
      >
        Dia {value}
      </button>
      <InlinePopover open={open} onClose={() => { setVal(String(value)); setOpen(false); }}>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={31}
            autoFocus
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") { setVal(String(value)); setOpen(false); }
            }}
            className="w-20"
          />
          <Button type="button" size="sm" onClick={commit}>OK</Button>
        </div>
      </InlinePopover>
    </div>
  );
}

/** Swatch de cor com ColorPicker em popover. */
function ColorSwatchEditor({
  value,
  onSave,
}: {
  value: string;
  onSave: (c: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-10 h-10 rounded-xl flex items-center justify-center hover:scale-105 transition-transform"
        style={{ backgroundColor: value + "30", border: `1px solid ${value}40` }}
        aria-label="Editar cor"
      >
        <CreditCard className="w-5 h-5" style={{ color: value }} />
      </button>
      <InlinePopover open={open} onClose={() => setOpen(false)} className="left-0">
        <ColorPicker
          value={value}
          onChange={(c) => { onSave(c); setOpen(false); }}
        />
      </InlinePopover>
    </div>
  );
}

/** Nome com edição via double-click. */
function NameEditor({
  value,
  onSave,
}: {
  value: string;
  onSave: (s: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  useEffect(() => setVal(value), [value]);

  if (editing) {
    return (
      <Input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => { setVal(value); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (val.trim() && val !== value) onSave(val.trim());
            setEditing(false);
          }
          if (e.key === "Escape") { setVal(value); setEditing(false); }
        }}
        className="h-7 text-sm py-1"
      />
    );
  }
  return (
    <p
      className="font-semibold text-zinc-100 cursor-text hover:text-indigo-300 transition-colors"
      onDoubleClick={() => setEditing(true)}
      title="Duplo clique para editar"
    >
      {value}
    </p>
  );
}

export default function CartaoPage() {
  const [cards, setCards] = useState<CreditCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CreditCardData | null>(null);
  const [saving, setSaving] = useState(false);
  const [brandAutoDetected, setBrandAutoDetected] = useState(false);
  const [brandUserOverridden, setBrandUserOverridden] = useState(false);
  const [form, setForm] = useState({
    name: "",
    bank: "",
    brand: "VISA",
    lastFour: "",
    limit: 0,
    closingDay: "1",
    dueDay: "10",
    holder: "",
    color: "#6366f1",
  });

  async function fetchCards() {
    setLoading(true);
    const res = await fetch("/api/credit-cards");
    if (res.ok) {
      const data = await res.json();
      setCards(data.map((c: CreditCardData & { limit: string | number; usedAmount: string | number }) => ({
        ...c,
        limit: Number(c.limit),
        usedAmount: Number(c.usedAmount),
      })));
    }
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
  useEffect(() => { fetchCards(); }, []);

  function openCreate() {
    setEditingCard(null);
    setForm({ name: "", bank: "", brand: "VISA", lastFour: "", limit: 0, closingDay: "1", dueDay: "10", holder: "", color: "#6366f1" });
    setBrandAutoDetected(false);
    setBrandUserOverridden(false);
    setModalOpen(true);
  }

  function openEdit(card: CreditCardData) {
    setEditingCard(card);
    setForm({
      name: card.name,
      bank: card.bank ?? "",
      brand: card.brand,
      lastFour: card.lastFour ?? "",
      limit: card.limit,
      closingDay: String(card.closingDay),
      dueDay: String(card.dueDay),
      holder: card.holder ?? "",
      color: card.color,
    });
    setBrandAutoDetected(false);
    setBrandUserOverridden(false);
    setModalOpen(true);
  }

  function handleLastFourChange(raw: string) {
    const digits = raw.replace(/\D/g, "");
    setForm((f) => ({ ...f, lastFour: digits.slice(0, 4) }));
    if (!editingCard && !brandUserOverridden && digits.length >= 4) {
      const detected = detectBrand(digits);
      if (detected) {
        setForm((f) => ({ ...f, brand: detected }));
        setBrandAutoDetected(true);
      }
    }
  }

  /** PATCH com optimistic update para edição inline. */
  async function patchCard(id: string, patch: Partial<CreditCardData>) {
    const prev = cards;
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const res = await fetch(`/api/credit-cards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      // rollback
      setCards(prev);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      name: form.name,
      bank: form.bank || null,
      brand: form.brand,
      lastFour: form.lastFour || null,
      limit: form.limit,
      closingDay: parseInt(form.closingDay),
      dueDay: parseInt(form.dueDay),
      holder: form.holder || null,
      color: form.color,
    };

    if (editingCard) {
      await fetch(`/api/credit-cards/${editingCard.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/credit-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    setSaving(false);
    setModalOpen(false);
    fetchCards();
  }

  return (
    <>
      <Header title="Cartões de Crédito" subtitle="Gestão de cartões empresariais" />
      <div className="flex-1 p-6 space-y-5">
        <div className="flex justify-end">
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" /> Novo Cartão
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-48 skeleton rounded-xl" />
            ))}
          </div>
        ) : cards.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="Sem cartões cadastrados"
            description="Cadastre seus cartões pra importar faturas com IA e controlar gastos por estabelecimento."
            actionLabel={
              <>
                <Plus className="w-4 h-4" /> Novo Cartão
              </>
            }
            onAction={openCreate}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map((card) => {
              const usedPercent = card.limit > 0 ? (card.usedAmount / card.limit) * 100 : 0;
              const availableAmount = card.limit - card.usedAmount;
              return (
                <div
                  key={card.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 hover:border-zinc-700 transition-colors"
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <ColorSwatchEditor
                        value={card.color}
                        onSave={(c) => patchCard(card.id, { color: c })}
                      />
                      <div>
                        <NameEditor
                          value={card.name}
                          onSave={(name) => patchCard(card.id, { name })}
                        />
                        <p className="text-xs text-zinc-500">
                          {card.bank ? `${card.bank} • ` : ""}{BRAND_LABELS[card.brand]}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(card)} className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Card Number */}
                  <p className="text-sm text-zinc-400 font-mono tracking-widest">
                    {maskCardNumber(card.lastFour)}
                  </p>

                  {/* Limit Progress */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-500">Utilizado</span>
                      <span className="text-zinc-300 font-medium">
                        {formatCurrency(card.usedAmount)} / {formatCurrency(card.limit)}
                      </span>
                    </div>
                    <Progress value={Math.min(usedPercent, 100)} className="h-1.5" />
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-500">{usedPercent.toFixed(0)}% utilizado</span>
                      <span className="text-emerald-400 font-medium">
                        {formatCurrency(availableAmount)} disponível
                      </span>
                    </div>
                  </div>

                  {/* Billing Info */}
                  <div className="flex gap-4 pt-1 border-t border-zinc-800">
                    <DayEditor
                      label="Fechamento"
                      tooltip="Dia do mês em que a fatura é fechada (corte). Compras feitas após esse dia caem na próxima fatura."
                      value={card.closingDay}
                      onSave={(n) => patchCard(card.id, { closingDay: n })}
                    />
                    <DayEditor
                      label="Vencimento"
                      tooltip="Dia do mês para pagar a fatura. Vence sempre nesse dia — pagamento após gera juros."
                      value={card.dueDay}
                      onSave={(n) => patchCard(card.id, { dueDay: n })}
                    />
                    {card.holder && (
                      <div>
                        <p className="text-xs text-zinc-600">Titular</p>
                        <p className="text-sm font-medium text-zinc-300">{card.holder}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCard ? "Editar Cartão" : "Novo Cartão"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome do Cartão *</Label>
              <Input placeholder="Ex: Itaú Platinum" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Banco</Label>
                <Input placeholder="Itaú, Bradesco..." value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Bandeira</Label>
                <Select
                  value={form.brand}
                  onValueChange={(v) => {
                    setForm({ ...form, brand: v });
                    setBrandUserOverridden(true);
                    setBrandAutoDetected(false);
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(BRAND_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {brandAutoDetected && !brandUserOverridden && (
                  <p className="text-[11px] text-indigo-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Detectado automaticamente
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Primeiros dígitos</Label>
                <Input
                  placeholder="1234"
                  inputMode="numeric"
                  maxLength={4}
                  value={form.lastFour}
                  onChange={(e) => handleLastFourChange(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Limite *</Label>
                <CurrencyInput
                  value={form.limit}
                  onChange={(n) => setForm({ ...form, limit: n })}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  Dia de Fechamento *
                  <InfoTooltip size="sm" text="Dia do mês em que a fatura é fechada (corte). Compras feitas após esse dia caem na próxima fatura." />
                </Label>
                <Input type="number" min={1} max={31} placeholder="1" value={form.closingDay} onChange={(e) => setForm({ ...form, closingDay: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  Dia de Vencimento *
                  <InfoTooltip size="sm" text="Dia do mês para pagar a fatura. Vence sempre nesse dia — pagamento após gera juros." />
                </Label>
                <Input type="number" min={1} max={31} placeholder="10" value={form.dueDay} onChange={(e) => setForm({ ...form, dueDay: e.target.value })} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Titular / Responsável</Label>
              <Input placeholder="Nome do titular" value={form.holder} onChange={(e) => setForm({ ...form, holder: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
