"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Building2,
  Save,
  Plus,
  Loader2,
  AlertTriangle,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { toast } from "@/lib/toast";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CompanySettings {
  id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  headcount: number;
  currency: string;
  timezone: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Formata CNPJ para exibição: 12.345.678/0001-90 */
function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ConfiguracoesPage() {
  const router = useRouter();
  const [data, setData] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit form
  const [form, setForm] = useState({
    name: "",
    document: "",
    email: "",
    phone: "",
    headcount: 0,
    currency: "BRL",
    timezone: "America/Sao_Paulo",
  });

  // Create company dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    name: "",
    document: "",
  });

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const company = (await res.json()) as CompanySettings;
        setData(company);
        setForm({
          name: company.name ?? "",
          document: company.document ?? "",
          email: company.email ?? "",
          phone: company.phone ?? "",
          headcount: company.headcount ?? 0,
          currency: company.currency ?? "BRL",
          timezone: company.timezone ?? "America/Sao_Paulo",
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // ── Save settings ──────────────────────────────────────────────────────────
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          document: form.document.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          headcount: Number(form.headcount) || 0,
          currency: form.currency,
          timezone: form.timezone,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error ?? "Erro ao salvar configurações");
        return;
      }
      toast.success("Configurações salvas");
      setData((prev) => prev ? { ...prev, ...body } : body);
    } finally {
      setSaving(false);
    }
  }

  // ── Create new company ────────────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateErr(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createForm.name.trim(),
          document: createForm.document.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateErr(body?.error ?? "Erro ao criar empresa");
        return;
      }
      toast.success(`Empresa "${body.name}" criada`);
      setCreateOpen(false);
      setCreateForm({ name: "", document: "" });
      // A nova empresa pode ter virado a "ativa" do usuário se ele só tinha 1.
      // Refresh do servidor pra revalidar layout/sidebar.
      router.refresh();
      fetchSettings();
    } finally {
      setCreating(false);
    }
  }

  // ── Delete company ─────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!data) return;
    if (deleteConfirm.trim() !== data.name) {
      setDeleteErr("Digite o nome exato da empresa");
      return;
    }
    setDeleting(true);
    setDeleteErr(null);
    try {
      const res = await fetch("/api/settings", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-confirm-name": data.name,
        },
        body: JSON.stringify({ confirmName: data.name }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && body?.details) {
          const { accounts = 0, transactions = 0 } = body.details as { accounts?: number; transactions?: number };
          setDeleteErr(
            `Empresa tem dados ativos: ${accounts} conta(s), ${transactions} lançamento(s). Remova/arquive antes.`
          );
        } else {
          setDeleteErr(body?.error ?? "Erro ao excluir empresa");
        }
        return;
      }
      toast.success("Empresa excluída");
      setDeleteOpen(false);
      // Após delete, o usuário fica sem empresa ativa — redireciona pra root
      // (o dashboard layout re-cria ou redireciona).
      router.push("/");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <Header title="Configurações" subtitle="Empresa, preferências e dados" />

      <div className="flex-1 p-6 space-y-5 max-w-3xl">
        {/* ── Empresa atual ───────────────────────────────────────────── */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-semibold text-zinc-100">Empresa Atual</h3>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setCreateErr(null); setCreateOpen(true); }}
            >
              <Plus className="w-4 h-4" /> Criar nova empresa
            </Button>
          </div>

          {loading ? (
            <div className="p-5 space-y-3">
              <div className="h-9 skeleton rounded-lg" />
              <div className="h-9 skeleton rounded-lg" />
              <div className="h-9 skeleton rounded-lg" />
            </div>
          ) : !data ? (
            <div className="p-5 text-sm text-zinc-500">Empresa não encontrada</div>
          ) : (
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="name">Nome da empresa</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Minha Empresa LTDA"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="document">CNPJ</Label>
                  <Input
                    id="document"
                    value={formatCnpj(form.document)}
                    onChange={(e) => setForm((f) => ({ ...f, document: e.target.value }))}
                    placeholder="00.000.000/0000-00"
                    maxLength={18}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="headcount">Nº de colaboradores</Label>
                  <Input
                    id="headcount"
                    type="number"
                    min={0}
                    value={form.headcount}
                    onChange={(e) => setForm((f) => ({ ...f, headcount: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="contato@empresa.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="(11) 99999-9999"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="currency">Moeda</Label>
                  <Input
                    id="currency"
                    value={form.currency}
                    onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase().slice(0, 3) }))}
                    placeholder="BRL"
                    maxLength={3}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="timezone">Fuso horário</Label>
                  <Input
                    id="timezone"
                    value={form.timezone}
                    onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                    placeholder="America/Sao_Paulo"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
                  ) : (
                    <><Save className="w-4 h-4" /> Salvar alterações</>
                  )}
                </Button>
              </div>
            </form>
          )}
        </section>

        {/* ── Danger zone ──────────────────────────────────────────────── */}
        {!loading && data && (
          <section className="bg-zinc-900 border border-red-900/40 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-red-900/40 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <h3 className="text-sm font-semibold text-red-300">Zona de Perigo</h3>
            </div>
            <div className="p-5 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-200">Excluir esta empresa</p>
                <p className="text-xs text-zinc-500 max-w-md">
                  Remove permanentemente <span className="text-zinc-300 font-medium">{data.name}</span>{" "}
                  e todos os dados associados (contas, lançamentos, categorias). Ação irreversível.
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={() => {
                  setDeleteConfirm("");
                  setDeleteErr(null);
                  setDeleteOpen(true);
                }}
              >
                <Trash2 className="w-4 h-4" /> Excluir empresa
              </Button>
            </div>
          </section>
        )}
      </div>

      {/* ── Create company dialog ───────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!creating) setCreateOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-400" />
              Criar nova empresa
            </DialogTitle>
            <DialogDescription>
              Você será adicionado automaticamente como administrador. Categorias e departamentos padrão serão criados.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            {createErr && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-950/50 border border-red-900 text-red-400 text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {createErr}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="create-name">Nome da empresa *</Label>
              <Input
                id="create-name"
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Minha Empresa LTDA"
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-document">CNPJ <span className="text-zinc-500">(opcional)</span></Label>
              <Input
                id="create-document"
                value={formatCnpj(createForm.document)}
                onChange={(e) => setCreateForm((f) => ({ ...f, document: e.target.value }))}
                placeholder="00.000.000/0000-00"
                maxLength={18}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                Cancelar
              </Button>
              <Button type="submit" disabled={creating || !createForm.name.trim()}>
                {creating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Criando...</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4" /> Criar empresa</>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm dialog ───────────────────────────────────────── */}
      <Dialog open={deleteOpen} onOpenChange={(o) => { if (!deleting) setDeleteOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Excluir empresa
            </DialogTitle>
            <DialogDescription>
              Esta ação é irreversível. Todos os dados associados serão perdidos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {deleteErr && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-950/50 border border-red-900 text-red-400 text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{deleteErr}</span>
              </div>
            )}
            <p className="text-sm text-zinc-300">
              Para confirmar, digite o nome exato da empresa:{" "}
              <span className="font-mono font-semibold text-white">{data?.name}</span>
            </p>
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={data?.name ?? ""}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting || deleteConfirm.trim() !== data?.name}
            >
              {deleting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Excluindo...</>
              ) : (
                <><Trash2 className="w-4 h-4" /> Excluir permanentemente</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
