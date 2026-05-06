"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import { ColorPicker } from "@/components/ui/color-picker";
import { Plus, Building2, Pencil, Loader2, Check, X } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useClickOutside } from "@/lib/use-click-outside";

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

type PopoverKind = "color" | "balance" | null;

export default function ContasPage() {
  const router = useRouter();
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

  // Inline edit state
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [openPopover, setOpenPopover] = useState<{ id: string; kind: PopoverKind } | null>(null);
  const [balanceDraft, setBalanceDraft] = useState(0);
  const popoverRef = useClickOutside<HTMLDivElement>(!!openPopover, () => setOpenPopover(null));

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

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
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

  // ---- Inline patch helpers (optimistic) ----
  async function patchAccount(id: string, patch: Partial<AccountData>) {
    const prev = accounts;
    setAccounts((cur) => cur.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    try {
      const res = await fetch(`/api/accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("patch failed");
    } catch {
      setAccounts(prev);
    }
  }

  function startEditingName(acc: AccountData) {
    setEditingNameId(acc.id);
    setNameDraft(acc.name);
  }

  async function commitName(acc: AccountData) {
    const trimmed = nameDraft.trim();
    setEditingNameId(null);
    if (!trimmed || trimmed === acc.name) return;
    await patchAccount(acc.id, { name: trimmed });
  }

  function openColorPopover(acc: AccountData) {
    setOpenPopover({ id: acc.id, kind: "color" });
  }

  function openBalancePopover(acc: AccountData) {
    setBalanceDraft(acc.balance);
    setOpenPopover({ id: acc.id, kind: "balance" });
  }

  async function commitBalance(acc: AccountData) {
    setOpenPopover(null);
    if (balanceDraft === acc.balance) return;
    await patchAccount(acc.id, { balance: balanceDraft });
  }

  function navigateToTransactions(accId: string) {
    router.push(`/lancamentos?accountId=${accId}`);
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
          <EmptyState
            icon={Building2}
            title="Sem contas bancárias"
            description="Cadastre suas contas pra acompanhar saldos e ter o caixa consolidado em tempo real."
            actionLabel={
              <>
                <Plus className="w-4 h-4" /> Nova Conta
              </>
            }
            onAction={openCreate}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map((acc) => {
              const isEditingName = editingNameId === acc.id;
              const colorOpen = openPopover?.id === acc.id && openPopover.kind === "color";
              const balanceOpen = openPopover?.id === acc.id && openPopover.kind === "balance";
              return (
                <div
                  key={acc.id}
                  onClick={() => navigateToTransactions(acc.id)}
                  className="relative bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 hover:border-indigo-500/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Color swatch — click opens color popover */}
                      <div className="relative shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openColorPopover(acc);
                          }}
                          className="w-10 h-10 rounded-xl flex items-center justify-center hover:ring-2 hover:ring-indigo-500/40 transition"
                          style={{ backgroundColor: acc.color + "30", border: `1px solid ${acc.color}40` }}
                          aria-label="Alterar cor"
                        >
                          <Building2 className="w-5 h-5" style={{ color: acc.color }} />
                        </button>
                        {colorOpen && (
                          <div
                            ref={popoverRef}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute left-0 top-12 z-30 bg-zinc-900 border border-zinc-700 rounded-lg p-3 shadow-xl shadow-black/40"
                          >
                            <p className="text-xs text-zinc-400 mb-2">Selecione uma cor</p>
                            <ColorPicker
                              value={acc.color}
                              onChange={async (color) => {
                                setOpenPopover(null);
                                await patchAccount(acc.id, { color });
                              }}
                            />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        {isEditingName ? (
                          <input
                            autoFocus
                            value={nameDraft}
                            onChange={(e) => setNameDraft(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onBlur={() => commitName(acc)}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === "Enter") commitName(acc);
                              else if (e.key === "Escape") setEditingNameId(null);
                            }}
                            className="bg-zinc-800 border border-indigo-500/60 rounded px-2 py-0.5 text-sm font-semibold text-zinc-100 outline-none w-full"
                          />
                        ) : (
                          <p
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              startEditingName(acc);
                            }}
                            title="Double-click para editar"
                            className="font-semibold text-zinc-100 truncate hover:text-indigo-300 transition-colors"
                          >
                            {acc.name}
                          </p>
                        )}
                        <p className="text-xs text-zinc-500">
                          {TYPE_LABELS[acc.type]}{acc.bank ? ` • ${acc.bank}` : ""}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(acc);
                      }}
                      className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 shrink-0"
                      aria-label="Editar conta"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {acc.agency && (
                    <p className="text-xs text-zinc-500 font-mono">
                      {acc.agency} / {acc.accountNumber}
                    </p>
                  )}

                  <div className="pt-2 border-t border-zinc-800 relative">
                    <p className="text-xs text-zinc-500 mb-1">Saldo atual</p>
                    <div className="flex items-center gap-2">
                      <p className={`text-2xl font-bold ${acc.balance >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {formatCurrency(acc.balance)}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openBalancePopover(acc);
                        }}
                        className="p-1 rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-indigo-300 transition"
                        aria-label="Ajustar saldo"
                        title="Ajustar saldo"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>

                    {balanceOpen && (
                      <div
                        ref={popoverRef}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute left-0 right-0 top-full mt-2 z-30 bg-zinc-900 border border-zinc-700 rounded-lg p-3 shadow-xl shadow-black/40 space-y-2"
                      >
                        <p className="text-xs text-zinc-400">Ajustar saldo</p>
                        <CurrencyInput
                          value={balanceDraft}
                          onChange={(n) => setBalanceDraft(n)}
                        />
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setOpenPopover(null)}
                            className="px-2 py-1 text-xs rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 inline-flex items-center gap-1"
                          >
                            <X className="w-3 h-3" /> Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => commitBalance(acc)}
                            className="px-2 py-1 text-xs rounded-md bg-indigo-600 hover:bg-indigo-500 text-white inline-flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" /> Confirmar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
