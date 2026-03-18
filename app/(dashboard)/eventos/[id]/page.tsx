"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/formatters";
import {
  Plus, Loader2, ChevronLeft, CalendarDays, MapPin, User, CheckCircle2,
  XCircle, Clock, Wallet, BarChart2, TrendingUp, AlertTriangle, Pencil, Trash2,
  ArrowRight, ExternalLink,
} from "lucide-react";

const EVENT_STATUS_LABELS: Record<string, string> = {
  PLANNING: "Planejamento", PENDING_APPROVAL: "Em aprovação", APPROVED: "Aprovado",
  IN_PROGRESS: "Em execução", FINISHED: "Finalizado", CANCELLED: "Cancelado",
};
const ITEM_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho", PENDING_APPROVAL: "Pend. aprovação", APPROVED: "Aprovado",
  REJECTED: "Recusado", INTEGRATED: "Integrado", PAID: "Pago", CANCELLED: "Cancelado",
};
const ITEM_STATUS_COLORS: Record<string, string> = {
  DRAFT:            "bg-zinc-700 text-zinc-400",
  PENDING_APPROVAL: "bg-amber-600/20 text-amber-400",
  APPROVED:         "bg-indigo-600/20 text-indigo-400",
  REJECTED:         "bg-red-600/20 text-red-400",
  INTEGRATED:       "bg-blue-600/20 text-blue-400",
  PAID:             "bg-emerald-600/20 text-emerald-400",
  CANCELLED:        "bg-zinc-600/20 text-zinc-500",
};

interface EventItem {
  id: string; description: string; amount: number; status: string;
  dueDate: string | null; requestedBy: string | null; notes: string | null;
  rejectionReason: string | null; transactionId: string | null;
  category: { id: string; name: string; color: string } | null;
  contact: { id: string; name: string } | null;
  transaction: { id: string; status: string; paymentDate: string | null } | null;
  createdAt: string;
}
interface EventDetail {
  id: string; name: string; type: string | null; startDate: string; endDate: string | null;
  location: string | null; responsible: string | null; description: string | null;
  status: string; budget: number;
  department: { id: string; name: string; color: string } | null;
  items: EventItem[];
  totals: { budget: number; planned: number; approved: number; paid: number; pending: number; rejected: number; balance: number };
}

const EMPTY_ITEM = { description: "", amount: "", categoryId: "", contactId: "", dueDate: "", paymentMethod: "", notes: "", requestedBy: "", status: "PENDING_APPROVAL" };

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);

  // Item modal
  const [itemModal, setItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<EventItem | null>(null);
  const [itemForm, setItemForm] = useState({ ...EMPTY_ITEM });
  const [itemSaving, setItemSaving] = useState(false);
  const [itemError, setItemError] = useState("");

  // Reject modal
  const [rejectModal, setRejectModal] = useState<{ item: EventItem } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/events/${id}`);
      if (!res.ok) { router.push("/eventos"); return; }
      setEvent(await res.json());
    } finally { setLoading(false); }
  }, [id, router]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/categories?type=EXPENSE").then(r => r.json()).then(d => setCategories(Array.isArray(d) ? d : []));
    fetch("/api/contacts").then(r => r.json()).then(d => setContacts(Array.isArray(d.contacts ?? d) ? (d.contacts ?? d) : []));
  }, []);

  async function saveItem() {
    if (!itemForm.description || !itemForm.amount) { setItemError("Descrição e valor são obrigatórios"); return; }
    setItemSaving(true); setItemError("");
    try {
      const body = { ...itemForm, amount: Number(itemForm.amount), categoryId: itemForm.categoryId || null, contactId: itemForm.contactId || null };
      const url   = editingItem ? `/api/events/${id}/items/${editingItem.id}` : `/api/events/${id}/items`;
      const method = editingItem ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setItemModal(false); setEditingItem(null); setItemForm({ ...EMPTY_ITEM }); load();
    } catch (e) { setItemError(e instanceof Error ? e.message : "Erro"); }
    finally { setItemSaving(false); }
  }

  async function approveItem(item: EventItem) {
    setActionLoading(item.id + "approve");
    try {
      await fetch(`/api/events/${id}/items/${item.id}/approve`, { method: "POST" });
      load();
    } finally { setActionLoading(null); }
  }

  async function confirmReject() {
    if (!rejectModal) return;
    setActionLoading(rejectModal.item.id + "reject");
    try {
      await fetch(`/api/events/${id}/items/${rejectModal.item.id}/reject`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });
      setRejectModal(null); setRejectReason(""); load();
    } finally { setActionLoading(null); }
  }

  async function deleteItem(item: EventItem) {
    if (!confirm(`Excluir "${item.description}"?`)) return;
    await fetch(`/api/events/${id}/items/${item.id}`, { method: "DELETE" });
    load();
  }

  async function updateEventStatus(status: string) {
    await fetch(`/api/events/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    load();
  }

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>;
  if (!event)  return null;

  const { totals } = event;
  const budgetPct = totals.budget > 0 ? Math.min(100, (totals.planned / totals.budget) * 100) : 0;
  const overBudget = totals.planned > totals.budget;

  const kpis = [
    { label: "Budget",               value: totals.budget,   color: "text-indigo-400",  bg: "bg-indigo-600/10", icon: Wallet },
    { label: "Planejado",            value: totals.planned,  color: "text-amber-400",   bg: "bg-amber-600/10",  icon: BarChart2 },
    { label: "Aprovado / Integrado", value: totals.approved, color: "text-blue-400",    bg: "bg-blue-600/10",   icon: CheckCircle2 },
    { label: "Pend. aprovação",      value: totals.pending,  color: "text-amber-400",   bg: "bg-amber-600/10",  icon: Clock },
    { label: "Recusado",             value: totals.rejected, color: "text-red-400",     bg: "bg-red-600/10",    icon: XCircle },
    { label: "Realizado / Pago",     value: totals.paid,     color: "text-emerald-400", bg: "bg-emerald-600/10",icon: TrendingUp },
    { label: "Saldo Disponível",     value: totals.balance,  color: totals.balance < 0 ? "text-red-400" : "text-zinc-200", bg: "bg-zinc-700/30", icon: AlertTriangle },
  ];

  return (
    <>
      <Header
        title={event.name}
        subtitle={
          <span className="flex items-center gap-2 text-zinc-500 text-sm">
            <button onClick={() => router.push("/eventos")} className="hover:text-zinc-300 flex items-center gap-1">
              <ChevronLeft className="w-3.5 h-3.5" /> Eventos
            </button>
            <span>/</span>
            <span>{event.name}</span>
          </span>
        }
      />
      <div className="flex-1 p-6 space-y-6">
        {/* Event meta */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                  { PLANNING: "bg-zinc-700 text-zinc-300", PENDING_APPROVAL: "bg-amber-600/20 text-amber-400", APPROVED: "bg-indigo-600/20 text-indigo-400", IN_PROGRESS: "bg-emerald-600/20 text-emerald-400", FINISHED: "bg-zinc-600/20 text-zinc-400", CANCELLED: "bg-red-600/20 text-red-400" }[event.status] ?? "bg-zinc-700 text-zinc-400"
                }`}>{EVENT_STATUS_LABELS[event.status]}</span>
                {event.type && <span className="text-xs text-zinc-500 border border-zinc-700 rounded-full px-2 py-0.5">{event.type}</span>}
              </div>
              <div className="flex items-center gap-5 text-sm text-zinc-400 flex-wrap">
                <span className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" />{new Date(event.startDate).toLocaleDateString("pt-BR")}{event.endDate && ` → ${new Date(event.endDate).toLocaleDateString("pt-BR")}`}</span>
                {event.location    && <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{event.location}</span>}
                {event.responsible && <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" />{event.responsible}</span>}
                {event.department  && <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: event.department.color }} />{event.department.name}</span>}
              </div>
              {event.description && <p className="text-sm text-zinc-500 max-w-2xl">{event.description}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Select value={event.status} onValueChange={updateEventStatus}>
                <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(EVENT_STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Budget progress */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-zinc-200">Consumo do Budget</span>
            <span className={`text-sm font-bold ${overBudget ? "text-red-400" : "text-zinc-300"}`}>{budgetPct.toFixed(1)}% — {formatCurrency(totals.planned)} de {formatCurrency(totals.budget)}</span>
          </div>
          <div className="h-3 rounded-full bg-zinc-800 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${overBudget ? "bg-red-500" : budgetPct > 80 ? "bg-amber-500" : "bg-indigo-500"}`} style={{ width: `${Math.min(100, budgetPct)}%` }} />
          </div>
          {overBudget && <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Orçamento excedido em {formatCurrency(totals.planned - totals.budget)}</p>}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          {kpis.map(({ label, value, color, bg, icon: Icon }) => (
            <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex flex-col gap-1">
              <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>
                <Icon className={`w-3.5 h-3.5 ${color}`} />
              </div>
              <p className="text-xs text-zinc-500 mt-1">{label}</p>
              <p className={`text-sm font-bold ${color}`}>{formatCurrency(value)}</p>
            </div>
          ))}
        </div>

        {/* Items table */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between">
            <span className="font-semibold text-zinc-100 text-sm">{event.items.length} lançamento{event.items.length !== 1 ? "s" : ""}</span>
            <Button size="sm" className="h-8 text-xs" onClick={() => { setEditingItem(null); setItemForm({ ...EMPTY_ITEM }); setItemModal(true); }}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Novo Lançamento
            </Button>
          </div>
          {event.items.length === 0 ? (
            <div className="flex flex-col items-center py-14 gap-2">
              <BarChart2 className="w-8 h-8 text-zinc-700" />
              <p className="text-sm text-zinc-500">Nenhum lançamento ainda</p>
              <Button variant="outline" size="sm" onClick={() => { setEditingItem(null); setItemForm({ ...EMPTY_ITEM }); setItemModal(true); }}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Adicionar primeiro lançamento
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    {["Descrição", "Categoria", "Fornecedor", "Solicitante", "Vencimento", "Valor", "Status", "Ações"].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {event.items.map((item) => (
                    <tr key={item.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-zinc-200 font-medium text-xs max-w-[200px] truncate">{item.description}</p>
                        {item.notes && <p className="text-xs text-zinc-500 truncate max-w-[200px]">{item.notes}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {item.category ? (
                          <span className="flex items-center gap-1 text-xs text-zinc-300">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: item.category.color ?? "#6366f1" }} />
                            {item.category.name}
                          </span>
                        ) : <span className="text-zinc-600 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-400">{item.contact?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-zinc-400">{item.requestedBy ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-zinc-400 whitespace-nowrap">
                        {item.dueDate ? new Date(item.dueDate).toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-red-400 whitespace-nowrap">{formatCurrency(item.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ITEM_STATUS_COLORS[item.status] ?? "bg-zinc-700 text-zinc-400"}`}>
                          {ITEM_STATUS_LABELS[item.status] ?? item.status}
                        </span>
                        {item.status === "REJECTED" && item.rejectionReason && (
                          <p className="text-xs text-red-400/70 mt-0.5 max-w-[120px] truncate" title={item.rejectionReason}>{item.rejectionReason}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {["DRAFT", "PENDING_APPROVAL"].includes(item.status) && (
                            <>
                              <button
                                onClick={() => approveItem(item)}
                                disabled={actionLoading === item.id + "approve"}
                                title="Aprovar"
                                className="p-1.5 rounded hover:bg-emerald-600/20 text-zinc-500 hover:text-emerald-400 transition-colors disabled:opacity-50"
                              >
                                {actionLoading === item.id + "approve" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={() => { setRejectModal({ item }); setRejectReason(""); }}
                                title="Recusar"
                                className="p-1.5 rounded hover:bg-red-600/20 text-zinc-500 hover:text-red-400 transition-colors"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          {item.status === "INTEGRATED" && item.transactionId && (
                            <button
                              onClick={() => router.push(`/lancamentos?highlight=${item.transactionId}`)}
                              title="Ver em Lançamentos"
                              className="p-1.5 rounded hover:bg-blue-600/20 text-zinc-500 hover:text-blue-400 transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {!["INTEGRATED", "PAID", "CANCELLED"].includes(item.status) && (
                            <button
                              onClick={() => { setEditingItem(item); setItemForm({ description: item.description, amount: String(item.amount), categoryId: item.category?.id ?? "", contactId: item.contact?.id ?? "", dueDate: item.dueDate ? item.dueDate.split("T")[0] : "", paymentMethod: "", notes: item.notes ?? "", requestedBy: item.requestedBy ?? "", status: item.status }); setItemModal(true); }}
                              title="Editar"
                              className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {["DRAFT", "REJECTED", "CANCELLED"].includes(item.status) && (
                            <button onClick={() => deleteItem(item)} title="Excluir" className="p-1.5 rounded hover:bg-red-600/20 text-zinc-500 hover:text-red-400 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Item Modal */}
      <Dialog open={itemModal} onOpenChange={setItemModal}>
        <DialogContent className="max-w-lg bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar Lançamento" : "Novo Lançamento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {itemError && <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">{itemError}</p>}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Descrição *</Label>
                <Input value={itemForm.description} onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))} placeholder="Ex: Buffet do evento" />
              </div>
              <div className="space-y-1.5">
                <Label>Valor (R$) *</Label>
                <Input type="number" min="0" step="0.01" value={itemForm.amount} onChange={e => setItemForm(f => ({ ...f, amount: e.target.value }))} placeholder="0,00" />
              </div>
              <div className="space-y-1.5">
                <Label>Vencimento</Label>
                <Input type="date" value={itemForm.dueDate} onChange={e => setItemForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={itemForm.categoryId || "__none__"} onValueChange={v => setItemForm(f => ({ ...f, categoryId: v === "__none__" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem categoria</SelectItem>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fornecedor</Label>
                <Select value={itemForm.contactId || "__none__"} onValueChange={v => setItemForm(f => ({ ...f, contactId: v === "__none__" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Solicitante</Label>
                <Input value={itemForm.requestedBy} onChange={e => setItemForm(f => ({ ...f, requestedBy: e.target.value }))} placeholder="Nome do solicitante" />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={itemForm.status} onValueChange={v => setItemForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ITEM_STATUS_LABELS).filter(([v]) => !["INTEGRATED","PAID"].includes(v)).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Observações</Label>
                <textarea value={itemForm.notes} onChange={e => setItemForm(f => ({ ...f, notes: e.target.value }))} placeholder="Detalhes adicionais..." rows={2}
                  className="w-full px-3 py-2 text-sm rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 resize-none" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setItemModal(false); setEditingItem(null); }}>Cancelar</Button>
            <Button onClick={saveItem} disabled={itemSaving}>
              {itemSaving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Salvando...</> : editingItem ? "Salvar alterações" : <><Plus className="w-4 h-4 mr-2" />Criar Lançamento</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Modal */}
      <Dialog open={!!rejectModal} onOpenChange={() => setRejectModal(null)}>
        <DialogContent className="max-w-md bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400"><XCircle className="w-4 h-4" /> Recusar Lançamento</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-zinc-400">Lançamento: <span className="text-zinc-200 font-medium">{rejectModal?.item.description}</span></p>
            <div className="space-y-1.5">
              <Label>Motivo da recusa</Label>
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Informe o motivo da recusa..." rows={3}
                className="w-full px-3 py-2 text-sm rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-red-500 resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectModal(null)}>Cancelar</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={confirmReject}
              disabled={actionLoading?.includes("reject")}
            >
              {actionLoading?.includes("reject") ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
              Confirmar Recusa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
