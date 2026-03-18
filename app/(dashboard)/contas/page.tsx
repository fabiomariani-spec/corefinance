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
import { formatCurrency } from "@/lib/formatters";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Plus, Building2, Pencil, TrendingUp, TrendingDown, Loader2 } from "lucide-react";

interface AccountData {
  id: string;
  name: string;
  type: string;
  bank: string | null;
  agency: string | null;
  accountNumber: string | null;
  balance: number;
  color: string;
}

const TYPE_LABELS: Record<string, string> = {
  CHECKING: "Conta Corrente",
  SAVINGS: "Poupança",
  INVESTMENT: "Investimento",
  CASH: "Caixa",
};

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#3b82f6", "#8b5cf6", "#ec4899"];

export default function ContasPage() {
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountData | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "CHECKING",
    bank: "",
    agency: "",
    accountNumber: "",
    balance: 0,
    color: "#6366f1",
  });

  async function fetchAccounts() {
    setLoading(true);
    const res = await fetch("/api/accounts");
    if (res.ok) {
      const data = await res.json();
      setAccounts(data.map((a: AccountData & { balance: string | number }) => ({
        ...a,
        balance: Number(a.balance),
      })));
    }
    setLoading(false);
  }

  useEffect(() => { fetchAccounts(); }, []);

  function openCreate() {
    setEditingAccount(null);
    setForm({ name: "", type: "CHECKING", bank: "", agency: "", accountNumber: "", balance: 0, color: "#6366f1" });
    setModalOpen(true);
  }

  function openEdit(acc: AccountData) {
    setEditingAccount(acc);
    setForm({
      name: acc.name,
      type: acc.type,
      bank: acc.bank ?? "",
      agency: acc.agency ?? "",
      accountNumber: acc.accountNumber ?? "",
      balance: acc.balance,
      color: acc.color,
    });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name,
      type: form.type,
      bank: form.bank || null,
      agency: form.agency || null,
      accountNumber: form.accountNumber || null,
      balance: form.balance,
      color: form.color,
    };

    if (editingAccount) {
      await fetch(`/api/accounts/${editingAccount.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    setSaving(false);
    setModalOpen(false);
    fetchAccounts();
  }

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

  return (
    <>
      <Header title="Contas Bancárias" subtitle="Gestão de contas da empresa" />
      <div className="flex-1 p-6 space-y-5">
        {/* Total */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-sm text-zinc-400">Saldo Total Consolidado</p>
            <p className={`text-3xl font-bold mt-1 ${totalBalance >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {formatCurrency(totalBalance)}
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" /> Nova Conta
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-40 skeleton rounded-xl" />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-zinc-500">
            <Building2 className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm">Nenhuma conta cadastrada</p>
            <Button className="mt-4" onClick={openCreate}>Adicionar Conta</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map((acc) => (
              <div
                key={acc.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: acc.color + "30", border: `1px solid ${acc.color}40` }}
                    >
                      <Building2 className="w-5 h-5" style={{ color: acc.color }} />
                    </div>
                    <div>
                      <p className="font-semibold text-zinc-100">{acc.name}</p>
                      <p className="text-xs text-zinc-500">
                        {TYPE_LABELS[acc.type]}{acc.bank ? ` • ${acc.bank}` : ""}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => openEdit(acc)} className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>

                {acc.agency && (
                  <p className="text-xs text-zinc-500 font-mono">
                    {acc.agency} / {acc.accountNumber}
                  </p>
                )}

                <div className="pt-2 border-t border-zinc-800">
                  <p className="text-xs text-zinc-500 mb-1">Saldo atual</p>
                  <p className={`text-2xl font-bold ${acc.balance >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {formatCurrency(acc.balance)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAccount ? "Editar Conta" : "Nova Conta"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome da Conta *</Label>
              <Input placeholder="Ex: Conta Corrente Itaú" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Banco</Label>
                <Input placeholder="Itaú, Bradesco..." value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Agência</Label>
                <Input placeholder="0001" value={form.agency} onChange={(e) => setForm({ ...form, agency: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Número da Conta</Label>
                <Input placeholder="12345-6" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Saldo Inicial</Label>
              <CurrencyInput
                value={form.balance}
                onChange={(n) => setForm({ ...form, balance: n })}
              />
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
