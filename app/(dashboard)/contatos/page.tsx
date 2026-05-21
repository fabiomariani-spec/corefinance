"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  X,
  UserCircle2,
  Building2,
  Users,
  Archive,
  Mail,
  Phone,
  FileText,
} from "lucide-react";
import { useDebounce } from "@/lib/use-debounce";
import { toast } from "@/lib/toast";

type ContactType = "SUPPLIER" | "CLIENT" | "BOTH";

interface Contact {
  id: string;
  name: string;
  type: ContactType;
  document: string | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { transactions: number; eventItems: number };
}

const TYPE_LABEL: Record<ContactType, string> = {
  SUPPLIER: "Fornecedor",
  CLIENT: "Cliente",
  BOTH: "Ambos",
};

const TYPE_BADGE: Record<ContactType, string> = {
  SUPPLIER: "bg-amber-600/15 text-amber-400 border border-amber-600/20",
  CLIENT: "bg-emerald-600/15 text-emerald-400 border border-emerald-600/20",
  BOTH: "bg-indigo-600/15 text-indigo-400 border border-indigo-600/20",
};

const EMPTY_FORM = {
  name: "",
  type: "BOTH" as ContactType,
  document: "",
  email: "",
  phone: "",
};

type FilterType = "all" | ContactType;

interface DeleteTarget {
  contact: Contact;
  hasLinks: boolean;
}

export default function ContatosPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const hasFetchedRef = useRef(false);

  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 300);
  const [typeFilter, setTypeFilter] = useState<FilterType>("all");
  const [includeInactive, setIncludeInactive] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formError, setFormError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!hasFetchedRef.current) setLoading(true);
    else setRefetching(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (includeInactive) params.set("includeInactive", "1");

      const res = await fetch(`/api/contacts?${params}`);
      const data = await res.json();
      setContacts(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
      setRefetching(false);
      hasFetchedRef.current = true;
    }
  }, [search, typeFilter, includeInactive]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(contact: Contact) {
    setEditing(contact);
    setForm({
      name: contact.name,
      type: contact.type,
      document: contact.document ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
    });
    setFormError("");
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError("Nome é obrigatório");
      return;
    }
    setSaving(true);
    setFormError("");

    const payload = {
      name: form.name.trim(),
      type: form.type,
      document: form.document.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
    };

    try {
      const res = editing
        ? await fetch(`/api/contacts/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/contacts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Erro ao salvar");
      }

      setModalOpen(false);
      setForm({ ...EMPTY_FORM });
      setEditing(null);
      toast.success(editing ? "Contato atualizado." : "Contato criado.");
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  function askDelete(contact: Contact) {
    const totalLinks =
      (contact._count?.transactions ?? 0) + (contact._count?.eventItems ?? 0);
    setDeleteTarget({ contact, hasLinks: totalLinks > 0 });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { contact, hasLinks } = deleteTarget;
    // Se há vínculos → arquivar (soft delete). Senão → hard delete.
    const url = hasLinks
      ? `/api/contacts/${contact.id}?archive=1`
      : `/api/contacts/${contact.id}`;

    try {
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Erro ao excluir");
      }
      setDeleteTarget(null);
      toast.success(hasLinks ? "Contato arquivado." : "Contato excluído.");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    } finally {
      setDeleting(false);
    }
  }

  async function handleToggleActive(contact: Contact) {
    const next = !contact.isActive;
    // optimistic
    setContacts((prev) =>
      prev.map((c) => (c.id === contact.id ? { ...c, isActive: next } : c))
    );
    const res = await fetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: next }),
    });
    if (!res.ok) {
      // rollback
      setContacts((prev) =>
        prev.map((c) =>
          c.id === contact.id ? { ...c, isActive: contact.isActive } : c
        )
      );
      toast.error("Erro ao atualizar status");
    }
  }

  const visibleContacts = contacts;

  return (
    <>
      <Header
        title="Contatos"
        subtitle="Clientes e fornecedores da empresa"
        actions={
          <Button onClick={openCreate} size="sm">
            <Plus className="w-4 h-4" /> Novo contato
          </Button>
        }
      />

      <div className="flex-1 p-6 space-y-5">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              placeholder="Buscar por nome, email, documento ou telefone..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                title="Limpar"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <Tabs
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v as FilterType)}
          >
            <TabsList>
              <TabsTrigger value="all">Todos</TabsTrigger>
              <TabsTrigger value="CLIENT">
                <Users className="w-3.5 h-3.5 mr-1.5" /> Clientes
              </TabsTrigger>
              <TabsTrigger value="SUPPLIER">
                <Building2 className="w-3.5 h-3.5 mr-1.5" /> Fornecedores
              </TabsTrigger>
              <TabsTrigger value="BOTH">Ambos</TabsTrigger>
            </TabsList>
          </Tabs>

          <button
            onClick={() => setIncludeInactive((v) => !v)}
            className={`flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-medium border transition-colors ${
              includeInactive
                ? "bg-zinc-800 border-zinc-600 text-zinc-200"
                : "bg-transparent border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
            }`}
            title="Incluir contatos arquivados"
          >
            <Archive className="w-3.5 h-3.5" />
            {includeInactive ? "Mostrando arquivados" : "Apenas ativos"}
          </button>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 skeleton rounded-lg" />
            ))}
          </div>
        ) : visibleContacts.length === 0 ? (
          <EmptyState
            icon={UserCircle2}
            title={
              search || typeFilter !== "all"
                ? "Nenhum contato encontrado"
                : "Sem contatos cadastrados"
            }
            description={
              search || typeFilter !== "all"
                ? "Ajuste a busca ou os filtros pra ver mais resultados."
                : "Cadastre clientes e fornecedores pra vincular aos seus lançamentos e relatórios."
            }
            actionLabel={
              <>
                <Plus className="w-4 h-4" /> Novo contato
              </>
            }
            onAction={openCreate}
          />
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-zinc-800 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              <div className="col-span-4">Nome</div>
              <div className="col-span-2">Tipo</div>
              <div className="col-span-3">Contato</div>
              <div className="col-span-2">Vínculos</div>
              <div className="col-span-1 text-right">Ações</div>
            </div>

            <div className={`divide-y divide-zinc-800 ${refetching ? "opacity-70" : ""}`}>
              {visibleContacts.map((c) => {
                const txCount = c._count?.transactions ?? 0;
                const eiCount = c._count?.eventItems ?? 0;
                const totalLinks = txCount + eiCount;
                return (
                  <div
                    key={c.id}
                    className={`grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-zinc-800/30 transition-colors group ${
                      !c.isActive ? "opacity-60" : ""
                    }`}
                  >
                    <div className="col-span-4 min-w-0">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-semibold text-zinc-300 shrink-0">
                          {c.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-100 truncate flex items-center gap-1.5">
                            {c.name}
                            {!c.isActive && (
                              <span className="text-[10px] uppercase tracking-wide text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                                Arquivado
                              </span>
                            )}
                          </p>
                          {c.document && (
                            <p className="text-xs text-zinc-500 truncate flex items-center gap-1">
                              <FileText className="w-3 h-3" /> {c.document}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="col-span-2">
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${TYPE_BADGE[c.type]}`}
                      >
                        {TYPE_LABEL[c.type]}
                      </span>
                    </div>

                    <div className="col-span-3 min-w-0 space-y-0.5">
                      {c.email && (
                        <a
                          href={`mailto:${c.email}`}
                          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-indigo-400 truncate"
                        >
                          <Mail className="w-3 h-3 shrink-0" />
                          <span className="truncate">{c.email}</span>
                        </a>
                      )}
                      {c.phone && (
                        <a
                          href={`tel:${c.phone}`}
                          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-indigo-400 truncate"
                        >
                          <Phone className="w-3 h-3 shrink-0" />
                          <span className="truncate">{c.phone}</span>
                        </a>
                      )}
                      {!c.email && !c.phone && (
                        <span className="text-xs text-zinc-600">—</span>
                      )}
                    </div>

                    <div className="col-span-2">
                      {totalLinks > 0 ? (
                        <div className="text-xs text-zinc-400 space-y-0.5">
                          {txCount > 0 && (
                            <p>
                              <span className="text-zinc-200 font-medium">{txCount}</span>{" "}
                              {txCount === 1 ? "lançamento" : "lançamentos"}
                            </p>
                          )}
                          {eiCount > 0 && (
                            <p>
                              <span className="text-zinc-200 font-medium">{eiCount}</span>{" "}
                              {eiCount === 1 ? "item de evento" : "itens de evento"}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-600">Sem vínculos</span>
                      )}
                    </div>

                    <div className="col-span-1 flex items-center justify-end gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleToggleActive(c)}
                        className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-200"
                        title={c.isActive ? "Arquivar" : "Reativar"}
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openEdit(c)}
                        className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-200"
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => askDelete(c)}
                        className="p-1.5 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400"
                        title="Excluir"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modal de criar/editar */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar Contato" : "Novo Contato"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input
                placeholder="Ex: João da Silva / Acme Ltda"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v as ContactType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CLIENT">Cliente</SelectItem>
                  <SelectItem value="SUPPLIER">Fornecedor</SelectItem>
                  <SelectItem value="BOTH">Ambos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Documento (CPF / CNPJ)</Label>
              <Input
                placeholder="00.000.000/0000-00"
                value={form.document}
                onChange={(e) => setForm({ ...form, document: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="contato@empresa.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input
                  placeholder="(11) 99999-9999"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>

            {formError && (
              <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {formError}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />{" "}
                    {editing ? "Salvando..." : "Criando..."}
                  </>
                ) : editing ? (
                  "Salvar"
                ) : (
                  "Criar"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title={deleteTarget?.hasLinks ? "Arquivar contato" : "Excluir contato"}
        confirmLabel={deleteTarget?.hasLinks ? "Arquivar" : "Excluir"}
        loadingLabel={deleteTarget?.hasLinks ? "Arquivando..." : "Excluindo..."}
        icon={deleteTarget?.hasLinks ? Archive : Trash2}
        message={
          <>
            <p>
              {deleteTarget?.hasLinks ? (
                <>
                  <span className="font-semibold text-white">
                    &ldquo;{deleteTarget?.contact.name}&rdquo;
                  </span>{" "}
                  possui vínculos com lançamentos ou itens de evento e não pode
                  ser excluído. Você pode arquivar pra ocultá-lo das listas.
                </>
              ) : (
                <>
                  Tem certeza que deseja excluir{" "}
                  <span className="font-semibold text-white">
                    &ldquo;{deleteTarget?.contact.name}&rdquo;
                  </span>
                  ?
                </>
              )}
            </p>
          </>
        }
        warning={
          deleteTarget?.hasLinks
            ? "Os lançamentos e itens vinculados permanecem intactos."
            : undefined
        }
      />
    </>
  );
}
