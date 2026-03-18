"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/formatters";
import {
  Plus, Search, CalendarDays, MapPin, User, ChevronRight,
  Loader2, TrendingUp, Wallet, CheckCircle2, BarChart2,
} from "lucide-react";

const EVENT_STATUS_LABELS: Record<string, string> = {
  PLANNING:         "Planejamento",
  PENDING_APPROVAL: "Em aprovação",
  APPROVED:         "Aprovado",
  IN_PROGRESS:      "Em execução",
  FINISHED:         "Finalizado",
  CANCELLED:        "Cancelado",
};
const EVENT_STATUS_COLORS: Record<string, string> = {
  PLANNING:         "bg-zinc-700 text-zinc-300",
  PENDING_APPROVAL: "bg-amber-600/20 text-amber-400",
  APPROVED:         "bg-indigo-600/20 text-indigo-400",
  IN_PROGRESS:      "bg-emerald-600/20 text-emerald-400",
  FINISHED:         "bg-zinc-600/20 text-zinc-400",
  CANCELLED:        "bg-red-600/20 text-red-400",
};

interface EventSummary {
  id: string; name: string; type: string | null;
  startDate: string; endDate: string | null;
  location: string | null; responsible: string | null;
  status: string; budget: number;
  department: { id: string; name: string; color: string } | null;
  totals: { budget: number; planned: number; approved: number; paid: number; balance: number };
}

const EMPTY_FORM = {
  name: "", type: "", startDate: "", endDate: "", location: "",
  responsible: "", description: "", budget: "", departmentId: "", status: "PLANNING",
};

export default function EventosPage() {
  const router = useRouter();
  const [events, setEvents]     = useState<EventSummary[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [form, setForm]         = useState({ ...EMPTY_FORM });
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search)                 params.set("search", search);
      const res = await fetch(`/api/events?${params}`);
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/departments").then(r => r.json()).then(d => setDepartments(Array.isArray(d) ? d : []));
  }, []);

  async function handleCreate() {
    if (!form.name || !form.startDate || !form.budget) {
      setFormError("Nome, data inicial e budget são obrigatórios"); return;
    }
    setSaving(true); setFormError("");
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, budget: Number(form.budget) }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const created = await res.json();
      setModalOpen(false);
      setForm({ ...EMPTY_FORM });
      router.push(`/eventos/${created.id}`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  // KPI totals across all events
  const totalBudget   = events.reduce((s, e) => s + e.totals.budget, 0);
  const totalPlanned  = events.reduce((s, e) => s + e.totals.planned, 0);
  const totalApproved = events.reduce((s, e) => s + e.totals.approved, 0);
  const totalPaid     = events.reduce((s, e) => s + e.totals.paid, 0);

  return (
    <>
      <Header title="Eventos" subtitle="Planejamento financeiro por evento" />
      <div className="flex-1 p-6 space-y-6">
        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Budget Total",   value: totalBudget,   icon: Wallet,       color: "text-indigo-400", bg: "bg-indigo-600/10" },
            { label: "Total Planejado",value: totalPlanned,  icon: BarChart2,    color: "text-amber-400",  bg: "bg-amber-600/10"  },
            { label: "Total Aprovado", value: totalApproved, icon: CheckCircle2, color: "text-emerald-400",bg: "bg-emerald-600/10"},
            { label: "Total Realizado",value: totalPaid,     icon: TrendingUp,   color: "text-zinc-300",   bg: "bg-zinc-700/30"   },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <div>
                <p className="text-xs text-zinc-500">{label}</p>
                <p className={`text-lg font-bold ${color}`}>{formatCurrency(value)}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input placeholder="Buscar evento..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(EVENT_STATUS_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => { setForm({ ...EMPTY_FORM }); setModalOpen(true); }}>
            <Plus className="w-4 h-4 mr-1.5" /> Novo Evento
          </Button>
        </div>

        {/* Events list */}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <CalendarDays className="w-10 h-10 text-zinc-600" />
            <p className="text-zinc-500 text-sm">Nenhum evento encontrado</p>
            <Button variant="outline" size="sm" onClick={() => { setForm({ ...EMPTY_FORM }); setModalOpen(true); }}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Criar primeiro evento
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((ev) => {
              const pct = ev.totals.budget > 0 ? Math.min(100, (ev.totals.planned / ev.totals.budget) * 100) : 0;
              const overBudget = ev.totals.planned > ev.totals.budget;
              return (
                <div
                  key={ev.id}
                  onClick={() => router.push(`/eventos/${ev.id}`)}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 cursor-pointer hover:border-zinc-600 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-zinc-100 group-hover:text-white truncate">{ev.name}</h3>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${EVENT_STATUS_COLORS[ev.status] ?? "bg-zinc-700 text-zinc-400"}`}>
                          {EVENT_STATUS_LABELS[ev.status] ?? ev.status}
                        </span>
                        {ev.type && <span className="text-xs text-zinc-500 shrink-0">{ev.type}</span>}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-zinc-500">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />
                          {new Date(ev.startDate).toLocaleDateString("pt-BR")}
                          {ev.endDate && ` → ${new Date(ev.endDate).toLocaleDateString("pt-BR")}`}
                        </span>
                        {ev.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{ev.location}</span>}
                        {ev.responsible && <span className="flex items-center gap-1"><User className="w-3 h-3" />{ev.responsible}</span>}
                        {ev.department && (
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full" style={{ background: ev.department.color }} />
                            {ev.department.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-8 shrink-0">
                      <div className="text-right">
                        <p className="text-xs text-zinc-500">Budget</p>
                        <p className="font-semibold text-zinc-100">{formatCurrency(ev.totals.budget)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-zinc-500">Planejado</p>
                        <p className={`font-semibold ${overBudget ? "text-red-400" : "text-amber-400"}`}>{formatCurrency(ev.totals.planned)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-zinc-500">Aprovado</p>
                        <p className="font-semibold text-emerald-400">{formatCurrency(ev.totals.approved)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-zinc-500">Realizado</p>
                        <p className="font-semibold text-zinc-300">{formatCurrency(ev.totals.paid)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-zinc-500">Saldo</p>
                        <p className={`font-semibold ${ev.totals.balance < 0 ? "text-red-400" : "text-zinc-200"}`}>{formatCurrency(ev.totals.balance)}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400" />
                    </div>
                  </div>
                  {/* Budget bar */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                      <span>Consumo do budget</span>
                      <span className={overBudget ? "text-red-400 font-semibold" : ""}>{pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${overBudget ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-indigo-500"}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Event Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-xl bg-zinc-950 border-zinc-800 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Evento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {formError && <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">{formError}</p>}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Nome do evento *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Congresso Nacional 2026" />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de evento</Label>
                <Input value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} placeholder="Ex: Presencial, Online..." />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(EVENT_STATUS_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Data inicial *</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Data final</Label>
                <Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Local</Label>
                <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Cidade / Endereço" />
              </div>
              <div className="space-y-1.5">
                <Label>Responsável</Label>
                <Input value={form.responsible} onChange={e => setForm(f => ({ ...f, responsible: e.target.value }))} placeholder="Nome do responsável" />
              </div>
              <div className="space-y-1.5">
                <Label>Budget total (R$) *</Label>
                <Input type="number" min="0" step="0.01" value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} placeholder="0,00" />
              </div>
              <div className="space-y-1.5">
                <Label>Departamento / Centro de custo</Label>
                <Select value={form.departmentId || "__none__"} onValueChange={v => setForm(f => ({ ...f, departmentId: v === "__none__" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Descrição / Observações</Label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Detalhes sobre o evento..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Criando...</> : <><Plus className="w-4 h-4 mr-2" />Criar Evento</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
