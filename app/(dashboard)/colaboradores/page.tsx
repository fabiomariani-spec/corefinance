"use client";

import { useEffect, useState, useMemo } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/formatters";
import {
  UserRound, Plus, Pencil, Pause, Play, UserX, Trash2,
  Loader2, Check, AlertTriangle, Users, TrendingDown,
  Building2, ChevronDown, ChevronRight, Search, ExternalLink,
  DollarSign, Save, ChevronLeft,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Department {
  id: string;
  name: string;
  color: string | null;
}

interface Employee {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  departmentId: string | null;
  salary: number;
  dueDayOfMonth: number;
  hireDate: string;
  dismissDate: string | null;
  status: "ACTIVE" | "PAUSED" | "DISMISSED";
  notes: string | null;
  department: Department | null;
  _count: { transactions: number };
}

interface ApiData {
  employees: Employee[];
  departments: Department[];
  totalMonthlyPayroll: number;
}

// ─── Status helpers ────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Ativo",
  PAUSED: "Pausado",
  DISMISSED: "Desligado",
};

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "bg-emerald-600/15 text-emerald-400 border border-emerald-600/20",
  PAUSED: "bg-amber-600/15 text-amber-400 border border-amber-600/20",
  DISMISSED: "bg-zinc-700 text-zinc-400 border border-zinc-600/20",
};

// ─── Empty form ────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: "",
  role: "",
  email: "",
  phone: "",
  departmentId: "",
  salary: "",
  dueDayOfMonth: "5",
  hireDate: format(new Date(), "yyyy-MM-dd"),
  notes: "",
};

// ─── EmployeeModal ─────────────────────────────────────────────────────────────

function EmployeeModal({
  open,
  onClose,
  onSuccess,
  departments,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  departments: Department[];
  editing: Employee | null;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        role: editing.role ?? "",
        email: editing.email ?? "",
        phone: editing.phone ?? "",
        departmentId: editing.departmentId ?? "",
        salary: String(editing.salary),
        dueDayOfMonth: String(editing.dueDayOfMonth),
        hireDate: editing.hireDate ? editing.hireDate.slice(0, 10) : format(new Date(), "yyyy-MM-dd"),
        notes: editing.notes ?? "",
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setError("");
  }, [editing, open]);

  function field(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!form.name.trim() || !form.salary) {
      setError("Nome e salário são obrigatórios.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const url = editing ? `/api/employees/${editing.id}` : "/api/employees";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          salary: Number(form.salary),
          dueDayOfMonth: Number(form.dueDayOfMonth),
          departmentId: form.departmentId === "__none__" || form.departmentId === "" ? null : form.departmentId,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Erro ao salvar");
      }
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-zinc-900 border border-zinc-800 text-zinc-100 max-w-lg w-full p-0 overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-zinc-800">
          <h2 className="text-base font-semibold">{editing ? "Editar Colaborador" : "Novo Colaborador"}</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {editing ? "Salário e dia de vencimento atualizarão os lançamentos futuros." : "Lançamentos de salário serão criados automaticamente para os próximos 12 meses."}
          </p>
        </div>
        <div className="px-6 py-4 space-y-4 max-h-[65vh] overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-900/50 rounded-lg text-xs text-red-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs text-zinc-400">Nome *</Label>
              <Input value={form.name} onChange={(e) => field("name", e.target.value)} placeholder="Nome completo" className="bg-zinc-800 border-zinc-700 text-xs h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Cargo</Label>
              <Input value={form.role} onChange={(e) => field("role", e.target.value)} placeholder="ex: Analista" className="bg-zinc-800 border-zinc-700 text-xs h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Departamento</Label>
              <Select value={form.departmentId} onValueChange={(v) => field("departmentId", v)}>
                <SelectTrigger className="h-9 text-xs bg-zinc-800 border-zinc-700">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem departamento</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Salário Fixo (R$) *</Label>
              <Input type="number" min="0" step="0.01" value={form.salary} onChange={(e) => field("salary", e.target.value)} placeholder="0,00" className="bg-zinc-800 border-zinc-700 text-xs h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Dia de Vencimento</Label>
              <Input type="number" min="1" max="28" value={form.dueDayOfMonth} onChange={(e) => field("dueDayOfMonth", e.target.value)} placeholder="5" className="bg-zinc-800 border-zinc-700 text-xs h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => field("email", e.target.value)} placeholder="email@empresa.com" className="bg-zinc-800 border-zinc-700 text-xs h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Telefone</Label>
              <Input value={form.phone} onChange={(e) => field("phone", e.target.value)} placeholder="(00) 00000-0000" className="bg-zinc-800 border-zinc-700 text-xs h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Data de Contratação</Label>
              <Input type="date" value={form.hireDate} onChange={(e) => field("hireDate", e.target.value)} className="bg-zinc-800 border-zinc-700 text-xs h-9" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs text-zinc-400">Observações</Label>
              <textarea
                value={form.notes}
                onChange={(e) => field("notes", e.target.value)}
                rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-md text-xs text-zinc-100 px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="Notas adicionais..."
              />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-between gap-3">
          <Button variant="outline" onClick={onClose} className="text-xs h-8">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="text-xs h-8">
            {saving ? <><Loader2 className="w-3 h-3 animate-spin" /> Salvando...</> : <><Check className="w-3 h-3" /> {editing ? "Salvar Alterações" : "Criar Colaborador"}</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ColaboradoresPage() {
  const router = useRouter();
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [deptFilter, setDeptFilter] = useState("__all__");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDismiss, setConfirmDismiss] = useState<Employee | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Employee | null>(null);
  const [simSelected, setSimSelected] = useState<Set<string>>(new Set());
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState("lista");

  // Variable compensation state
  const [varSearch, setVarSearch] = useState("");
  const [varDeptFilter, setVarDeptFilter] = useState("__all__");
  const [varMonth, setVarMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [varRecords, setVarRecords] = useState<Record<string, { amount: number; description: string | null; paymentDate: string | null }>>({});
  const [varDraft, setVarDraft] = useState<Record<string, string>>({});
  const [varDateDraft, setVarDateDraft] = useState<Record<string, string>>({});
  const [varSaving, setVarSaving] = useState<string | null>(null);
  const [varLoading, setVarLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/employees");
      const d = await res.json();
      // Guard: only set data if the response has the expected shape
      if (d && Array.isArray(d.employees)) {
        setData(d);
      } else {
        setData({ employees: [], departments: [], totalMonthlyPayroll: 0 });
      }
    } catch {
      setData({ employees: [], departments: [], totalMonthlyPayroll: 0 });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Load variable compensation when month changes
  async function loadVariable(month: string) {
    setVarLoading(true);
    try {
      const res = await fetch(`/api/employees/variable?month=${month}`);
      const d = await res.json();
      if (d.records) {
        setVarRecords(d.records);
        const draft: Record<string, string> = {};
        const dateDraft: Record<string, string> = {};
        for (const [empId, v] of Object.entries(d.records)) {
          const rec = v as { amount: number; paymentDate: string | null };
          draft[empId] = String(rec.amount);
          dateDraft[empId] = rec.paymentDate ?? "";
        }
        setVarDraft(draft);
        setVarDateDraft(dateDraft);
      }
    } catch { /* ignore */ }
    finally { setVarLoading(false); }
  }

  useEffect(() => {
    if (tab === "variavel") loadVariable(varMonth);
  }, [tab, varMonth]);

  async function saveVariable(employeeId: string) {
    setVarSaving(employeeId);
    try {
      const amount = parseFloat(varDraft[employeeId] || "0");
      const paymentDate = varDateDraft[employeeId] || null;
      await fetch("/api/employees/variable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, month: varMonth, amount, paymentDate }),
      });
      await loadVariable(varMonth);
    } finally { setVarSaving(null); }
  }

  // Filtered list
  const filtered = useMemo(() => {
    if (!data?.employees) return [];
    return data.employees.filter((e) => {
      if (statusFilter && statusFilter !== "__all__" && e.status !== statusFilter) return false;
      if (deptFilter && deptFilter !== "__all__" && e.departmentId !== deptFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return e.name.toLowerCase().includes(q) || (e.role ?? "").toLowerCase().includes(q);
      }
      return true;
    });
  }, [data, statusFilter, deptFilter, search]);

  // Dept groups for tab 2
  const deptGroups = useMemo(() => {
    if (!data?.employees) return [];
    const active = data.employees.filter((e) => e.status === "ACTIVE");
    const map = new Map<string, { dept: Department | null; employees: Employee[] }>();
    for (const e of active) {
      const key = e.departmentId ?? "__none__";
      if (!map.has(key)) map.set(key, { dept: e.department, employees: [] });
      map.get(key)!.employees.push(e);
    }
    const totalPayroll = active.reduce((s, e) => s + Number(e.salary), 0);
    return Array.from(map.entries())
      .map(([, g]) => ({
        dept: g.dept,
        employees: g.employees,
        total: g.employees.reduce((s, e) => s + Number(e.salary), 0),
        avg: g.employees.length > 0 ? g.employees.reduce((s, e) => s + Number(e.salary), 0) / g.employees.length : 0,
        pct: totalPayroll > 0 ? (g.employees.reduce((s, e) => s + Number(e.salary), 0) / totalPayroll) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [data]);

  // Simulation
  const activeEmployees = useMemo(() => (data?.employees ?? []).filter((e) => e.status === "ACTIVE"), [data]);
  const totalPayroll = data?.totalMonthlyPayroll ?? 0;
  const simSavings = useMemo(() => {
    return activeEmployees.filter((e) => simSelected.has(e.id)).reduce((s, e) => s + Number(e.salary), 0);
  }, [simSelected, activeEmployees]);

  async function changeStatus(employee: Employee, status: "ACTIVE" | "PAUSED" | "DISMISSED") {
    setActionLoading(employee.id + status);
    try {
      await fetch(`/api/employees/${employee.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await load();
    } finally {
      setActionLoading(null);
      setConfirmDismiss(null);
    }
  }

  async function deleteEmployee(employee: Employee) {
    setActionLoading(employee.id + "delete");
    try {
      await fetch(`/api/employees/${employee.id}`, { method: "DELETE" });
      await load();
    } finally {
      setActionLoading(null);
      setConfirmDelete(null);
    }
  }

  async function applySimDismissal() {
    for (const id of simSelected) {
      const emp = activeEmployees.find((e) => e.id === id);
      if (emp) await changeStatus(emp, "DISMISSED");
    }
    setSimSelected(new Set());
    setTab("lista");
    setStatusFilter("__all__");
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <>
      <Header title="Colaboradores" subtitle="Gestão de pessoal e folha de pagamento" />
      <div className="flex-1 p-6 space-y-5">

        {/* KPI bar */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total de Colaboradores", value: String(data?.employees.filter((e) => e.status !== "DISMISSED").length ?? 0), sub: "ativos + pausados" },
            { label: "Ativos", value: String(data?.employees.filter((e) => e.status === "ACTIVE").length ?? 0), color: "text-emerald-400" },
            { label: "Folha Mensal", value: formatCurrency(totalPayroll), color: "text-red-400" },
            { label: "Folha Anual", value: formatCurrency(totalPayroll * 12), color: "text-amber-400" },
          ].map((k) => (
            <div key={k.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500">{k.label}</p>
              <p className={`text-xl font-bold mt-1 ${k.color ?? "text-zinc-100"}`}>{k.value}</p>
              {k.sub && <p className="text-xs text-zinc-600 mt-0.5">{k.sub}</p>}
            </div>
          ))}
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="lista" className="text-xs"><Users className="w-3.5 h-3.5 mr-1.5" />Colaboradores</TabsTrigger>
            <TabsTrigger value="departamentos" className="text-xs"><Building2 className="w-3.5 h-3.5 mr-1.5" />Por Departamento</TabsTrigger>
            <TabsTrigger value="variavel" className="text-xs"><DollarSign className="w-3.5 h-3.5 mr-1.5" />Variável</TabsTrigger>
            <TabsTrigger value="simulacao" className="text-xs"><TrendingDown className="w-3.5 h-3.5 mr-1.5" />Simulações</TabsTrigger>
          </TabsList>

          {/* ─── TAB 1: Lista ─────────────────────────────────────── */}
          <TabsContent value="lista" className="space-y-4 mt-4">
            {/* Filters */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar colaborador..." className="pl-8 h-8 text-xs bg-zinc-900 border-zinc-700" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-xs w-36 bg-zinc-900 border-zinc-700">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos os status</SelectItem>
                  <SelectItem value="ACTIVE">Ativos</SelectItem>
                  <SelectItem value="PAUSED">Pausados</SelectItem>
                  <SelectItem value="DISMISSED">Desligados</SelectItem>
                </SelectContent>
              </Select>
              <Select value={deptFilter} onValueChange={setDeptFilter}>
                <SelectTrigger className="h-8 text-xs w-44 bg-zinc-900 border-zinc-700">
                  <SelectValue placeholder="Departamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos os departs.</SelectItem>
                  {data?.departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex-1" />
              <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="h-8 text-xs">
                <Plus className="w-3.5 h-3.5 mr-1.5" />Novo Colaborador
              </Button>
            </div>

            {/* Table */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">Nome</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">Cargo</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">Departamento</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-zinc-500">Salário</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500">Vcto</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-zinc-500">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-zinc-500 text-xs">
                        <UserRound className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        Nenhum colaborador encontrado
                      </td>
                    </tr>
                  ) : (
                    filtered.map((emp) => {
                      const isLoading = actionLoading?.startsWith(emp.id);
                      return (
                        <tr key={emp.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-indigo-600/20 flex items-center justify-center shrink-0">
                                <span className="text-xs font-bold text-indigo-400">{emp.name.charAt(0).toUpperCase()}</span>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-zinc-100">{emp.name}</p>
                                {emp.email && <p className="text-xs text-zinc-500">{emp.email}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-zinc-400">{emp.role || "—"}</td>
                          <td className="px-4 py-3">
                            {emp.department ? (
                              <span className="inline-flex items-center gap-1 text-xs text-zinc-300">
                                <span className="w-2 h-2 rounded-full" style={{ background: emp.department.color ?? "#6366f1" }} />
                                {emp.department.name}
                              </span>
                            ) : (
                              <span className="text-xs text-zinc-600">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-semibold text-red-400">
                            {formatCurrency(Number(emp.salary))}
                          </td>
                          <td className="px-4 py-3 text-center text-xs text-zinc-400">dia {emp.dueDayOfMonth}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[emp.status]}`}>
                              {STATUS_LABEL[emp.status]}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {/* Edit */}
                              <button
                                onClick={() => { setEditing(emp); setModalOpen(true); }}
                                className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-200 transition-colors"
                                title="Editar"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>

                              {/* Ver lançamentos */}
                              <button
                                onClick={() => router.push(`/lancamentos?search=${encodeURIComponent(emp.name)}`)}
                                className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-200 transition-colors"
                                title="Ver lançamentos"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>

                              {/* Pause / Activate */}
                              {emp.status === "ACTIVE" && (
                                <button
                                  onClick={() => changeStatus(emp, "PAUSED")}
                                  disabled={!!isLoading}
                                  className="p-1.5 rounded hover:bg-amber-900/30 text-zinc-500 hover:text-amber-400 transition-colors"
                                  title="Pausar"
                                >
                                  {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
                                </button>
                              )}
                              {emp.status === "PAUSED" && (
                                <button
                                  onClick={() => changeStatus(emp, "ACTIVE")}
                                  disabled={!!isLoading}
                                  className="p-1.5 rounded hover:bg-emerald-900/30 text-zinc-500 hover:text-emerald-400 transition-colors"
                                  title="Reativar"
                                >
                                  {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                </button>
                              )}

                              {/* Dismiss */}
                              {emp.status !== "DISMISSED" && (
                                <button
                                  onClick={() => setConfirmDismiss(emp)}
                                  className="p-1.5 rounded hover:bg-red-900/30 text-zinc-500 hover:text-red-400 transition-colors"
                                  title="Dispensar"
                                >
                                  <UserX className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Delete */}
                              <button
                                onClick={() => setConfirmDelete(emp)}
                                className="p-1.5 rounded hover:bg-red-900/30 text-zinc-500 hover:text-red-500 transition-colors"
                                title="Excluir"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* ─── TAB 2: Por Departamento ──────────────────────────── */}
          <TabsContent value="departamentos" className="space-y-3 mt-4">
            {deptGroups.length === 0 ? (
              <div className="text-center py-16 text-zinc-500 text-xs">
                <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Nenhum colaborador ativo cadastrado
              </div>
            ) : (
              deptGroups.map((g) => {
                const key = g.dept?.id ?? "__none__";
                const expanded = expandedDepts.has(key);
                return (
                  <div key={key} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedDepts((prev) => {
                        const next = new Set(prev);
                        if (next.has(key)) next.delete(key); else next.add(key);
                        return next;
                      })}
                      className="w-full px-5 py-4 flex items-center gap-4 hover:bg-zinc-800/30 transition-colors"
                    >
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ background: g.dept?.color ?? "#6b7280" }}
                      />
                      <div className="flex-1 text-left">
                        <p className="text-sm font-semibold text-zinc-100">{g.dept?.name ?? "Sem Departamento"}</p>
                        <p className="text-xs text-zinc-500">{g.employees.length} colaborador{g.employees.length !== 1 ? "es" : ""} · média {formatCurrency(g.avg)}</p>
                      </div>
                      <div className="flex items-center gap-6 shrink-0">
                        <div className="text-right">
                          <p className="text-xs text-zinc-500">Mensal</p>
                          <p className="text-sm font-bold text-red-400">{formatCurrency(g.total)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-zinc-500">Anual</p>
                          <p className="text-sm font-bold text-zinc-300">{formatCurrency(g.total * 12)}</p>
                        </div>
                        <div className="text-right w-14">
                          <p className="text-xs text-zinc-500">{g.pct.toFixed(1)}%</p>
                          <div className="h-1.5 rounded-full bg-zinc-800 mt-1 overflow-hidden">
                            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${g.pct}%` }} />
                          </div>
                        </div>
                        {expanded ? <ChevronDown className="w-4 h-4 text-zinc-600" /> : <ChevronRight className="w-4 h-4 text-zinc-600" />}
                      </div>
                    </button>
                    {expanded && (
                      <div className="border-t border-zinc-800">
                        {g.employees.map((emp, i) => (
                          <div key={emp.id} className={`flex items-center justify-between px-5 py-3 ${i < g.employees.length - 1 ? "border-b border-zinc-800/50" : ""}`}>
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center">
                                <span className="text-xs font-bold text-zinc-300">{emp.name.charAt(0)}</span>
                              </div>
                              <div>
                                <p className="text-xs font-medium text-zinc-200">{emp.name}</p>
                                {emp.role && <p className="text-xs text-zinc-500">{emp.role}</p>}
                              </div>
                            </div>
                            <p className="text-xs font-semibold text-red-400">{formatCurrency(Number(emp.salary))}/mês</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </TabsContent>

          {/* ─── TAB: Variável ──────────────────────────────────── */}
          <TabsContent value="variavel" className="space-y-4 mt-4">
            {(() => {
              const activeEmps = (data?.employees ?? [])
                .filter((e) => e.status === "ACTIVE")
                .filter((e) => !varSearch || e.name.toLowerCase().includes(varSearch.toLowerCase()))
                .filter((e) => varDeptFilter === "__all__" || e.departmentId === varDeptFilter);
              const totalFixo = activeEmps.reduce((s, e) => s + Number(e.salary), 0);
              const totalVar = activeEmps.reduce((s, e) => s + (varRecords[e.id] ? Number(varRecords[e.id].amount) : 0), 0);

              // Group by dept
              const deptMap = new Map<string, { name: string; color: string; fixo: number; variavel: number; count: number }>();
              for (const emp of activeEmps) {
                const dKey = emp.departmentId ?? "__none__";
                const dName = emp.department?.name ?? "Sem Departamento";
                const dColor = emp.department?.color ?? "#6b7280";
                if (!deptMap.has(dKey)) deptMap.set(dKey, { name: dName, color: dColor, fixo: 0, variavel: 0, count: 0 });
                const d = deptMap.get(dKey)!;
                d.fixo += Number(emp.salary);
                d.variavel += varRecords[emp.id] ? Number(varRecords[emp.id].amount) : 0;
                d.count += 1;
              }
              const deptSummary = Array.from(deptMap.values()).sort((a, b) => (b.fixo + b.variavel) - (a.fixo + a.variavel));

              return (
                <>
                  {/* Month selector + search + dept filter */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <button onClick={() => {
                        const [y, m] = varMonth.split("-").map(Number);
                        const d = new Date(y, m - 2, 1);
                        setVarMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
                      }} className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200">
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-sm font-semibold text-zinc-100 min-w-[140px] text-center">
                        {new Date(Number(varMonth.split("-")[0]), Number(varMonth.split("-")[1]) - 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).replace(/^\w/, (c) => c.toUpperCase())}
                      </span>
                      <button onClick={() => {
                        const [y, m] = varMonth.split("-").map(Number);
                        const d = new Date(y, m, 1);
                        setVarMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
                      }} className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 flex-1 min-w-[260px]">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <Input
                          placeholder="Buscar colaborador..."
                          className="pl-9 h-9 text-sm"
                          value={varSearch}
                          onChange={(e) => setVarSearch(e.target.value)}
                        />
                      </div>
                      <Select value={varDeptFilter} onValueChange={setVarDeptFilter}>
                        <SelectTrigger className="w-44 h-9 text-sm">
                          <SelectValue placeholder="Departamento" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">Todos os departamentos</SelectItem>
                          {(data?.departments ?? []).map((d) => (
                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Summary cards */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <p className="text-xs text-zinc-500">Total Fixo</p>
                      <p className="text-lg font-bold text-red-400 mt-1">{formatCurrency(totalFixo)}</p>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <p className="text-xs text-zinc-500">Total Variável</p>
                      <p className="text-lg font-bold text-amber-400 mt-1">{formatCurrency(totalVar)}</p>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <p className="text-xs text-zinc-500">Total Geral</p>
                      <p className="text-lg font-bold text-zinc-100 mt-1">{formatCurrency(totalFixo + totalVar)}</p>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <p className="text-xs text-zinc-500">% Variável</p>
                      <p className="text-lg font-bold text-indigo-400 mt-1">{(totalFixo + totalVar) > 0 ? ((totalVar / (totalFixo + totalVar)) * 100).toFixed(1) : "0.0"}%</p>
                    </div>
                  </div>

                  {/* Department breakdown */}
                  {deptSummary.length > 0 && (
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                      {deptSummary.map((d) => (
                        <div key={d.name} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                            <span className="text-xs font-semibold text-zinc-200">{d.name}</span>
                            <span className="text-xs text-zinc-500 ml-auto">{d.count} pessoas</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-zinc-500">Fixo</span>
                            <span className="text-red-400 font-semibold">{formatCurrency(d.fixo)}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs mt-1">
                            <span className="text-zinc-500">Variável</span>
                            <span className="text-amber-400 font-semibold">{formatCurrency(d.variavel)}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs mt-1 pt-1 border-t border-zinc-800">
                            <span className="text-zinc-400 font-semibold">Total</span>
                            <span className="text-zinc-100 font-bold">{formatCurrency(d.fixo + d.variavel)}</span>
                          </div>
                          {(d.fixo + d.variavel) > 0 && (
                            <div className="h-1.5 rounded-full bg-zinc-800 mt-2 overflow-hidden flex">
                              <div className="h-full bg-red-500" style={{ width: `${(d.fixo / (d.fixo + d.variavel)) * 100}%` }} />
                              <div className="h-full bg-amber-500" style={{ width: `${(d.variavel / (d.fixo + d.variavel)) * 100}%` }} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Employee variable input table */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                      <span className="text-sm font-semibold text-zinc-100">Remuneração Variável por Colaborador</span>
                      {varLoading && <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />}
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-800">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">Colaborador</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">Departamento</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-zinc-500">Fixo</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-zinc-500 w-36">Variável (R$)</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 w-40">Data Pagamento</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-zinc-500">Total</th>
                          <th className="w-12 px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {activeEmps.length === 0 ? (
                          <tr><td colSpan={7} className="text-center py-10 text-xs text-zinc-500">Nenhum colaborador ativo</td></tr>
                        ) : (
                          activeEmps.map((emp) => {
                            const fixo = Number(emp.salary);
                            const varValue = parseFloat(varDraft[emp.id] || "0") || 0;
                            const saved = varRecords[emp.id]?.amount ?? 0;
                            const savedDate = varRecords[emp.id]?.paymentDate ?? "";
                            const draftDate = varDateDraft[emp.id] ?? "";
                            const hasChange = varValue !== saved || draftDate !== savedDate;
                            return (
                              <tr key={emp.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full bg-indigo-600/20 flex items-center justify-center shrink-0">
                                      <span className="text-xs font-bold text-indigo-400">{emp.name.charAt(0)}</span>
                                    </div>
                                    <div>
                                      <p className="text-xs font-semibold text-zinc-100">{emp.name}</p>
                                      {emp.role && <p className="text-xs text-zinc-500">{emp.role}</p>}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  {emp.department ? (
                                    <span className="inline-flex items-center gap-1 text-xs text-zinc-300">
                                      <span className="w-2 h-2 rounded-full" style={{ background: emp.department.color ?? "#6366f1" }} />
                                      {emp.department.name}
                                    </span>
                                  ) : <span className="text-xs text-zinc-600">—</span>}
                                </td>
                                <td className="px-4 py-3 text-right text-xs font-semibold text-red-400">{formatCurrency(fixo)}</td>
                                <td className="px-4 py-3">
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={varDraft[emp.id] ?? ""}
                                    onChange={(e) => setVarDraft((p) => ({ ...p, [emp.id]: e.target.value }))}
                                    onKeyDown={(e) => { if (e.key === "Enter") saveVariable(emp.id); }}
                                    placeholder="0,00"
                                    className="h-7 text-xs text-right bg-zinc-800 border-zinc-700 w-full"
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <Input
                                    type="date"
                                    value={varDateDraft[emp.id] ?? ""}
                                    onChange={(e) => setVarDateDraft((p) => ({ ...p, [emp.id]: e.target.value }))}
                                    onKeyDown={(e) => { if (e.key === "Enter") saveVariable(emp.id); }}
                                    className="h-7 text-xs bg-zinc-800 border-zinc-700 w-full"
                                  />
                                </td>
                                <td className="px-4 py-3 text-right text-xs font-bold text-zinc-100">{formatCurrency(fixo + varValue)}</td>
                                <td className="px-4 py-3">
                                  <button
                                    onClick={() => saveVariable(emp.id)}
                                    disabled={!hasChange || varSaving === emp.id}
                                    className={`p-1.5 rounded transition-colors ${hasChange ? "hover:bg-emerald-900/30 text-emerald-400" : "text-zinc-700 cursor-default"}`}
                                    title="Salvar"
                                  >
                                    {varSaving === emp.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}
          </TabsContent>

          {/* ─── TAB 3: Simulações ────────────────────────────────── */}
          <TabsContent value="simulacao" className="mt-4">
            <div className="flex gap-5">
              {/* Employee checklist */}
              <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800">
                  <p className="text-sm font-semibold text-zinc-100">Selecione colaboradores para simular desligamento</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Marque quem você deseja desligar e veja o impacto em tempo real</p>
                </div>
                <div className="divide-y divide-zinc-800/50">
                  {activeEmployees.length === 0 ? (
                    <div className="text-center py-10 text-zinc-500 text-xs">Nenhum colaborador ativo</div>
                  ) : (
                    activeEmployees.map((emp) => {
                      const selected = simSelected.has(emp.id);
                      return (
                        <label key={emp.id} className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${selected ? "bg-red-950/20" : "hover:bg-zinc-800/20"}`}>
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center border transition-colors shrink-0 ${selected ? "bg-red-600 border-red-600" : "border-zinc-600"}`}
                            onClick={() => {
                              setSimSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(emp.id)) next.delete(emp.id); else next.add(emp.id);
                                return next;
                              });
                            }}
                          >
                            {selected && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-zinc-100">{emp.name}</p>
                            <p className="text-xs text-zinc-500">{emp.role || (emp.department?.name ?? "—")}</p>
                          </div>
                          <p className="text-xs font-semibold text-red-400 shrink-0">{formatCurrency(Number(emp.salary))}</p>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Simulation panel */}
              <div className="w-72 space-y-3 shrink-0">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
                  <p className="text-sm font-semibold text-zinc-100">Impacto da Simulação</p>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">Colaboradores selecionados</span>
                      <span className="text-sm font-bold text-zinc-100">{simSelected.size}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">Economia mensal</span>
                      <span className="text-sm font-bold text-emerald-400">{formatCurrency(simSavings)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">Economia anual</span>
                      <span className="text-sm font-bold text-emerald-400">{formatCurrency(simSavings * 12)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">Redução da folha</span>
                      <span className="text-sm font-bold text-zinc-100">
                        {totalPayroll > 0 ? ((simSavings / totalPayroll) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">Folha restante</span>
                      <span className="text-sm font-bold text-red-400">{formatCurrency(totalPayroll - simSavings)}</span>
                    </div>
                  </div>

                  <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                      style={{ width: totalPayroll > 0 ? `${(simSavings / totalPayroll) * 100}%` : "0%" }}
                    />
                  </div>
                  <p className="text-xs text-zinc-600 text-center">
                    {simSelected.size === 0 ? "Selecione colaboradores na lista" : `${((simSavings / totalPayroll) * 100).toFixed(1)}% de redução na folha`}
                  </p>
                </div>

                {simSelected.size > 0 && (
                  <Button
                    onClick={applySimDismissal}
                    className="w-full h-9 text-xs bg-red-700 hover:bg-red-600 text-white"
                  >
                    <UserX className="w-3.5 h-3.5 mr-1.5" />
                    Aplicar Desligamento ({simSelected.size})
                  </Button>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Employee Modal */}
      <EmployeeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={load}
        departments={data?.departments ?? []}
        editing={editing}
      />

      {/* Confirm Dismiss Dialog */}
      {confirmDismiss && (
        <Dialog open onOpenChange={() => setConfirmDismiss(null)}>
          <DialogContent className="bg-zinc-900 border border-zinc-800 text-zinc-100 max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-950/50 flex items-center justify-center">
                <UserX className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="text-sm font-semibold">Dispensar colaborador?</p>
                <p className="text-xs text-zinc-500">{confirmDismiss.name}</p>
              </div>
            </div>
            <p className="text-xs text-zinc-400">
              Todos os lançamentos de salário <strong>pendentes</strong> serão cancelados. O histórico de pagamentos anteriores é mantido.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setConfirmDismiss(null)} className="text-xs h-8">Cancelar</Button>
              <Button
                onClick={() => changeStatus(confirmDismiss, "DISMISSED")}
                className="text-xs h-8 bg-red-700 hover:bg-red-600 text-white"
                disabled={!!actionLoading}
              >
                {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirmar Desligamento"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Confirm Delete Dialog */}
      {confirmDelete && (
        <Dialog open onOpenChange={() => setConfirmDelete(null)}>
          <DialogContent className="bg-zinc-900 border border-zinc-800 text-zinc-100 max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-950/50 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="text-sm font-semibold">Excluir colaborador?</p>
                <p className="text-xs text-zinc-500">{confirmDelete.name}</p>
              </div>
            </div>
            <p className="text-xs text-zinc-400">
              O registro será excluído permanentemente. Lançamentos futuros serão cancelados. Lançamentos passados são preservados.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setConfirmDelete(null)} className="text-xs h-8">Cancelar</Button>
              <Button
                onClick={() => deleteEmployee(confirmDelete)}
                className="text-xs h-8 bg-red-700 hover:bg-red-600 text-white"
                disabled={!!actionLoading}
              >
                {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Excluir"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
