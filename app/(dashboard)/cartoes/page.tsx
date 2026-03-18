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
import { Plus, CreditCard, Pencil, Trash2, Loader2 } from "lucide-react";

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
  OTHER: "Outro",
};

const COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#3b82f6", "#10b981",
  "#f59e0b", "#ef4444", "#14b8a6",
];

export default function CartaoPage() {
  const [cards, setCards] = useState<CreditCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CreditCardData | null>(null);
  const [saving, setSaving] = useState(false);
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

  useEffect(() => { fetchCards(); }, []);

  function openCreate() {
    setEditingCard(null);
    setForm({ name: "", bank: "", brand: "VISA", lastFour: "", limit: 0, closingDay: "1", dueDay: "10", holder: "", color: "#6366f1" });
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
    setModalOpen(true);
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
          <div className="flex flex-col items-center justify-center py-24 text-zinc-500">
            <CreditCard className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm">Nenhum cartão cadastrado</p>
            <Button className="mt-4" onClick={openCreate}>Adicionar Cartão</Button>
          </div>
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
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: card.color + "30", border: `1px solid ${card.color}40` }}
                      >
                        <CreditCard className="w-5 h-5" style={{ color: card.color }} />
                      </div>
                      <div>
                        <p className="font-semibold text-zinc-100">{card.name}</p>
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
                    <div>
                      <p className="text-xs text-zinc-600">Fechamento</p>
                      <p className="text-sm font-medium text-zinc-300">Dia {card.closingDay}</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-600">Vencimento</p>
                      <p className="text-sm font-medium text-zinc-300">Dia {card.dueDay}</p>
                    </div>
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
                <Select value={form.brand} onValueChange={(v) => setForm({ ...form, brand: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(BRAND_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Últimos 4 dígitos</Label>
                <Input placeholder="1234" maxLength={4} value={form.lastFour} onChange={(e) => setForm({ ...form, lastFour: e.target.value })} />
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
                <Label>Dia de Fechamento *</Label>
                <Input type="number" min={1} max={31} placeholder="1" value={form.closingDay} onChange={(e) => setForm({ ...form, closingDay: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label>Dia de Vencimento *</Label>
                <Input type="number" min={1} max={31} placeholder="10" value={form.dueDay} onChange={(e) => setForm({ ...form, dueDay: e.target.value })} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Titular / Responsável</Label>
              <Input placeholder="Nome do titular" value={form.holder} onChange={(e) => setForm({ ...form, holder: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <div className="flex gap-2">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`w-7 h-7 rounded-full transition-transform ${form.color === color ? "scale-125 ring-2 ring-white ring-offset-2 ring-offset-zinc-900" : ""}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setForm({ ...form, color })}
                  />
                ))}
              </div>
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
