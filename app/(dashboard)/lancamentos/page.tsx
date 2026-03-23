"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TransactionModal } from "@/components/transactions/transaction-modal";
import { formatCurrency, formatDate, formatStatus } from "@/lib/formatters";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Search,
  ArrowUpCircle,
  ArrowDownCircle,
  Pencil,
  Trash2,
  Copy,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  RefreshCw,
  Clock,
  TrendingDown,
  ChevronDown,
  AlertTriangle,
  X,
  CalendarRange,
  Loader2,
  SlidersHorizontal,
} from "lucide-react";

interface Transaction {
  id: string;
  description: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  status: string;
  isPredicted: boolean;
  isRecurring: boolean;
  installmentNumber?: number | null;
  installmentTotal?: number | null;
  competenceDate: string;
  dueDate: string | null;
  paymentDate: string | null;
  category?: { id: string; name: string; color: string } | null;
  department?: { id: string; name: string; color: string } | null;
  contact?: { id: string; name: string } | null;
  account?: { id: string; name: string } | null;
  creditCard?: { id: string; name: string } | null;
}

interface Department {
  id: string;
  name: string;
  color: string;
}

interface DeptBreakdown {
  departmentId: string | null;
  name: string;
  color: string;
  amount: number;
}

interface Summary {
  expensePending: number;
  expensePaid: number;
  pendingByDepartment: DeptBreakdown[];
}

const statusBadgeVariant: Record<string, "default" | "secondary" | "destructive" | "success" | "warning" | "outline"> = {
  PENDING: "warning",
  PREDICTED: "outline",
  PAID: "success",
  RECEIVED: "success",
  OVERDUE: "destructive",
  CANCELLED: "secondary",
};

function toDateStr(d: Date) {
  return d.toISOString().split("T")[0]; // "YYYY-MM-DD"
}
function fmtDisplayDate(iso: string) {
  const [y, m, day] = iso.split("-");
  return `${day}/${m}/${y}`;
}
const NOW = new Date();
const DEFAULT_FROM = toDateStr(new Date(NOW.getFullYear(), NOW.getMonth(), 1));
const DEFAULT_TO   = toDateStr(new Date(NOW.getFullYear(), NOW.getMonth() + 1, 0));

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>(DEFAULT_FROM);
  const [dateTo, setDateTo]     = useState<string>(DEFAULT_TO);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [summary, setSummary] = useState<Summary>({ expensePending: 0, expensePaid: 0, pendingByDepartment: [] });
  const [showDeptBreakdown, setShowDeptBreakdown] = useState(false);
  const deptDropdownRef = useRef<HTMLDivElement>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Single delete dialog
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [singleDeleting, setSingleDeleting] = useState(false);


  const limit = 20;

  // Close dept dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (deptDropdownRef.current && !deptDropdownRef.current.contains(e.target as Node)) {
        setShowDeptBreakdown(false);
      }
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setShowDatePicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);


  // Fetch departments once
  useEffect(() => {
    fetch("/api/departments")
      .then((r) => r.json())
      .then((data) => setDepartments(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const isPendingPayments = statusFilter === "PENDING_PAYMENTS";
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        ...(search && { search }),
        ...(dateFrom && { startDate: dateFrom }),
        ...(dateTo   && { endDate:   dateTo }),
        ...(departmentFilter !== "all" && { departmentId: departmentFilter }),
        ...(typeFilter !== "all" && !isPendingPayments && { type: typeFilter }),
        ...(isPendingPayments && { type: "EXPENSE", status: "PENDING,OVERDUE" }),
        ...(!isPendingPayments && statusFilter !== "all" && { status: statusFilter }),
      });
      const res = await fetch(`/api/transactions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions.map((t: Transaction & { amount: string | number }) => ({
          ...t,
          amount: Number(t.amount),
        })));
        setTotal(data.total);
        if (data.summary) setSummary(data.summary);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, typeFilter, statusFilter, dateFrom, dateTo, departmentFilter]);

  useEffect(() => {
    fetchTransactions();
    setSelectedIds(new Set()); // clear selection on filter/page change
  }, [fetchTransactions]);

  // Keep the "select all" checkbox indeterminate when partial selection
  useEffect(() => {
    if (!selectAllRef.current) return;
    const pageIds = transactions.map((t) => t.id);
    const selectedOnPage = pageIds.filter((id) => selectedIds.has(id));
    selectAllRef.current.indeterminate =
      selectedOnPage.length > 0 && selectedOnPage.length < pageIds.length;
  }, [selectedIds, transactions]);

  const isAllPageSelected = transactions.length > 0 && transactions.every((t) => selectedIds.has(t.id));

  function toggleSelectAll() {
    const pageIds = transactions.map((t) => t.id);
    if (isAllPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }

  function toggleSelectOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      await fetch("/api/transactions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      fetchTransactions();
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTargetId) return;
    setSingleDeleting(true);
    try {
      await fetch(`/api/transactions/${deleteTargetId}`, { method: "DELETE" });
      setDeleteTargetId(null);
      fetchTransactions();
    } finally {
      setSingleDeleting(false);
    }
  }

  async function handleStatusUpdate(id: string, newStatus: string) {
    const paymentDate = (newStatus === "PAID" || newStatus === "RECEIVED")
      ? new Date().toISOString().split("T")[0]
      : null;
    await fetch(`/api/transactions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, paymentDate }),
    });
    fetchTransactions();
  }

  async function handleDuplicate(tx: Transaction) {
    const { id, ...rest } = tx;
    await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...rest,
        description: `${rest.description} (cópia)`,
        amount: rest.amount,
        categoryId: rest.category?.id ?? null,
        departmentId: rest.department?.id ?? null,
        contactId: rest.contact?.id ?? null,
        accountId: rest.account?.id ?? null,
        creditCardId: rest.creditCard?.id ?? null,
        status: "PENDING",
      }),
    });
    fetchTransactions();
  }

  const totalPages = Math.ceil(total / limit);
  const totalPrevisto = summary.expensePending + summary.expensePaid;

  return (
    <>
      <Header title="Lançamentos" subtitle="Entradas e saídas financeiras" />

      <div className="flex-1 p-6 space-y-5">
        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4">
          {/* Saídas Pendentes — clicável com breakdown por departamento */}
          <div className="relative" ref={deptDropdownRef}>
            <button
              onClick={() => setShowDeptBreakdown((v) => !v)}
              className={`w-full bg-zinc-900 border rounded-xl p-4 flex items-center gap-3 hover:border-amber-600/50 transition-colors text-left ${
                showDeptBreakdown ? "border-amber-600/50" : "border-zinc-800"
              }`}
            >
              <div className="w-9 h-9 rounded-lg bg-amber-600/15 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-500">Saídas Pendentes</p>
                <p className="text-lg font-bold text-amber-400">{formatCurrency(summary.expensePending)}</p>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${showDeptBreakdown ? "rotate-180" : ""}`}
              />
            </button>

            {/* Dropdown breakdown por departamento */}
            {showDeptBreakdown && (
              <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl shadow-black/40 overflow-hidden">
                <div className="px-3 py-2 border-b border-zinc-800">
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Pendentes por Departamento</p>
                </div>
                {summary.pendingByDepartment.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-zinc-500">
                    Nenhuma saída pendente
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-800/60">
                    {summary.pendingByDepartment.map((d, i) => {
                      const pct = summary.expensePending > 0
                        ? (d.amount / summary.expensePending) * 100
                        : 0;
                      return (
                        <div key={d.departmentId ?? `no-dept-${i}`} className="px-3 py-2.5">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: d.color }}
                              />
                              <span className="text-xs text-zinc-300 font-medium">{d.name}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-semibold text-amber-400">
                                {formatCurrency(d.amount)}
                              </span>
                              <span className="text-xs text-zinc-600 ml-1.5">
                                {pct.toFixed(0)}%
                              </span>
                            </div>
                          </div>
                          {/* Progress bar */}
                          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, backgroundColor: d.color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* Total footer */}
                <div className="px-3 py-2 border-t border-zinc-800 bg-zinc-800/40 flex justify-between items-center">
                  <span className="text-xs text-zinc-500">Total pendente</span>
                  <span className="text-xs font-bold text-amber-400">{formatCurrency(summary.expensePending)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Saídas Pagas */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-600/15 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-zinc-500">Saídas Pagas</p>
              <p className="text-lg font-bold text-emerald-400">{formatCurrency(summary.expensePaid)}</p>
            </div>
          </div>

          {/* Total Previsto */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-600/15 flex items-center justify-center shrink-0">
              <TrendingDown className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <p className="text-xs text-zinc-500">Total Previsto</p>
              <p className="text-lg font-bold text-red-400">{formatCurrency(totalPrevisto)}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-5">

        {/* Filters + Actions */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                placeholder="Buscar lançamentos..."
                className="pl-9"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>

            {/* Date range picker */}
            <div ref={datePickerRef} className="relative">
              <button
                onClick={() => setShowDatePicker((v) => !v)}
                className="flex items-center gap-2 h-10 px-3 rounded-md border border-zinc-700 bg-zinc-900 text-sm text-zinc-200 hover:border-zinc-500 transition-colors whitespace-nowrap"
              >
                <CalendarRange className="w-4 h-4 text-zinc-400 shrink-0" />
                <span>{dateFrom ? fmtDisplayDate(dateFrom) : "Início"}</span>
                <span className="text-zinc-600">→</span>
                <span>{dateTo ? fmtDisplayDate(dateTo) : "Fim"}</span>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-500 ml-1" />
              </button>
              {showDatePicker && (
                <div className="absolute top-12 left-0 z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl p-4 w-72 space-y-4">
                  {/* Quick shortcuts */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { label: "Este mês",      from: toDateStr(new Date(NOW.getFullYear(), NOW.getMonth(), 1)),       to: toDateStr(new Date(NOW.getFullYear(), NOW.getMonth() + 1, 0)) },
                      { label: "Mês passado",   from: toDateStr(new Date(NOW.getFullYear(), NOW.getMonth() - 1, 1)),   to: toDateStr(new Date(NOW.getFullYear(), NOW.getMonth(), 0)) },
                      { label: "Próx. 30 dias", from: toDateStr(NOW),                                                   to: toDateStr(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + 30)) },
                      { label: "Próx. 3 meses", from: toDateStr(NOW),                                                   to: toDateStr(new Date(NOW.getFullYear(), NOW.getMonth() + 3, 0)) },
                      { label: "Este ano",      from: toDateStr(new Date(NOW.getFullYear(), 0, 1)),                     to: toDateStr(new Date(NOW.getFullYear(), 11, 31)) },
                      { label: "Todos",         from: "",                                                               to: "" },
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        onClick={() => { setDateFrom(opt.from); setDateTo(opt.to); setPage(1); setShowDatePicker(false); }}
                        className="px-2 py-1.5 text-xs rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors text-left"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-zinc-800 pt-3 space-y-2">
                    <p className="text-xs text-zinc-500 font-medium">Intervalo personalizado</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="text-xs text-zinc-500 mb-1 block">De</label>
                        <input
                          type="date"
                          value={dateFrom}
                          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                          className="w-full h-8 px-2 text-xs rounded-md border border-zinc-700 bg-zinc-800 text-zinc-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-zinc-500 mb-1 block">Até</label>
                        <input
                          type="date"
                          value={dateTo}
                          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                          className="w-full h-8 px-2 text-xs rounded-md border border-zinc-700 bg-zinc-800 text-zinc-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                    <Button size="sm" className="w-full h-8 text-xs mt-1" onClick={() => setShowDatePicker(false)}>
                      Aplicar
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* More Filters toggle */}
            <button
              onClick={() => setShowMoreFilters((v) => !v)}
              className={`flex items-center gap-1.5 h-10 px-3 rounded-md border text-sm transition-colors whitespace-nowrap ${
                showMoreFilters || departmentFilter !== "all" || typeFilter !== "all" || statusFilter !== "all"
                  ? "border-indigo-500/50 bg-indigo-600/10 text-indigo-300"
                  : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filtros
              {(departmentFilter !== "all" || typeFilter !== "all" || statusFilter !== "all") && (
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-semibold">
                  {[departmentFilter !== "all", typeFilter !== "all", statusFilter !== "all"].filter(Boolean).length}
                </span>
              )}
            </button>

            <Button
              onClick={() => {
                setEditingTransaction(null);
                setModalOpen(true);
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 border-0 font-semibold"
            >
              <Plus className="w-4 h-4" />
              Novo Lançamento
            </Button>
          </div>

          {/* Extended Filters — progressive disclosure */}
          {showMoreFilters && (
            <div className="flex items-center gap-3 flex-wrap pl-1 animate-in fade-in slide-in-from-top-2 duration-200">
              {/* Departamento */}
              <Select value={departmentFilter} onValueChange={(v) => { setDepartmentFilter(v); setPage(1); }}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Departamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os depart.</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                        {d.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Tipo */}
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="INCOME">Entradas</SelectItem>
                  <SelectItem value="EXPENSE">Saídas</SelectItem>
                </SelectContent>
              </Select>

              {/* Status */}
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="PENDING_PAYMENTS">Pagamentos Pendentes</SelectItem>
                  <SelectItem value="PENDING">Pendente</SelectItem>
                  <SelectItem value="OVERDUE">Atrasado</SelectItem>
                  <SelectItem value="PREDICTED">Previsto</SelectItem>
                  <SelectItem value="PAID">Pago</SelectItem>
                  <SelectItem value="RECEIVED">Recebido</SelectItem>
                </SelectContent>
              </Select>

              {/* Clear all filters */}
              {(departmentFilter !== "all" || typeFilter !== "all" || statusFilter !== "all") && (
                <button
                  onClick={() => { setDepartmentFilter("all"); setTypeFilter("all"); setStatusFilter("all"); setPage(1); }}
                  className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Limpar filtros
                </button>
              )}
            </div>
          )}
        </div>

        {/* Bulk Action Bar — visible when items are selected */}
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-600/10 border border-indigo-600/30 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                {selectedIds.size}
              </div>
              <span className="text-sm text-indigo-300 font-medium">
                {selectedIds.size === 1 ? "1 lançamento selecionado" : `${selectedIds.size} lançamentos selecionados`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
                className="text-zinc-400 border-zinc-700"
              >
                <X className="w-3.5 h-3.5" />
                Limpar seleção
              </Button>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white border-0"
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir selecionados
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="px-4 py-3 w-10">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={isAllPageSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-indigo-600 cursor-pointer accent-indigo-600"
                      title="Selecionar todos desta página"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Descrição</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Categoria</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Departamento</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Competência</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Vencimento</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Valor Total</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-zinc-800/50">
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 skeleton rounded" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-zinc-500">
                      Nenhum lançamento encontrado
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr
                      key={tx.id}
                      className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors group ${selectedIds.has(tx.id) ? "bg-indigo-600/5" : ""}`}
                    >
                      <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(tx.id)}
                          onChange={() => toggleSelectOne(tx.id)}
                          className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-indigo-600 cursor-pointer accent-indigo-600"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {tx.type === "INCOME" ? (
                            <ArrowUpCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                          ) : (
                            <ArrowDownCircle className="w-4 h-4 text-red-500 shrink-0" />
                          )}
                          <div>
                            <p className="text-zinc-100 font-medium truncate max-w-[200px]">
                              {tx.description}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {tx.isRecurring && (
                                <span className="flex items-center gap-0.5 text-xs text-indigo-400">
                                  <RefreshCw className="w-2.5 h-2.5" />
                                  {tx.installmentNumber && tx.installmentTotal
                                    ? `${tx.installmentNumber}/${tx.installmentTotal}`
                                    : "Recorrente"}
                                </span>
                              )}
                              {tx.isPredicted && <span className="text-xs text-zinc-500">Previsto</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {tx.category ? (
                          <div className="flex items-center gap-1.5">
                            <div
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: tx.category.color }}
                            />
                            <span className="text-zinc-300 text-xs">{tx.category.name}</span>
                          </div>
                        ) : (
                          <span className="text-zinc-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {tx.department ? (
                          <div className="flex items-center gap-1.5">
                            <div
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: tx.department.color }}
                            />
                            <span className="text-zinc-300 text-xs">{tx.department.name}</span>
                          </div>
                        ) : (
                          <span className="text-zinc-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-400 text-xs">
                        {formatDate(tx.competenceDate)}
                      </td>
                      <td className="px-4 py-3 text-zinc-400 text-xs">
                        {tx.dueDate ? formatDate(tx.dueDate) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {(tx.status === "PENDING" || tx.status === "OVERDUE") ? (
                          <button
                            onClick={() => handleStatusUpdate(tx.id, tx.type === "EXPENSE" ? "PAID" : "RECEIVED")}
                            title={tx.type === "EXPENSE" ? "Clique para marcar como Pago" : "Clique para marcar como Recebido"}
                            className="group/status flex items-center gap-1.5 rounded-md px-1 -mx-1 hover:bg-emerald-600/10 transition-colors"
                          >
                            <Badge variant={statusBadgeVariant[tx.status] ?? "secondary"} className="group-hover/status:hidden">
                              {formatStatus(tx.status)}
                            </Badge>
                            <span className="hidden group-hover/status:flex items-center gap-1 text-xs font-semibold text-emerald-400 whitespace-nowrap">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {tx.type === "EXPENSE" ? "Marcar Pago" : "Marcar Recebido"}
                            </span>
                          </button>
                        ) : (
                          <Badge variant={statusBadgeVariant[tx.status] ?? "secondary"}>
                            {formatStatus(tx.status)}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`font-semibold ${tx.type === "INCOME" ? "text-emerald-400" : "text-red-400"}`}
                        >
                          {tx.type === "INCOME" ? "+" : "-"}
                          {formatCurrency(tx.amount)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { setEditingTransaction(tx); setModalOpen(true); }}
                            className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDuplicate(tx)}
                            className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteTargetId(tx.id)}
                            className="p-1.5 rounded-md hover:bg-red-600/20 text-zinc-400 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
              <span className="text-xs text-zinc-500">
                {total} lançamentos • Página {page} de {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

      </div>

    </div>

      {/* Single Delete Confirmation */}
      <Dialog open={!!deleteTargetId} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Excluir lançamento
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-sm text-zinc-300">
              Tem certeza que deseja excluir este lançamento?
            </p>
            <p className="text-xs text-zinc-500">Esta ação não pode ser desfeita.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTargetId(null)} disabled={singleDeleting}>
              Cancelar
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white border-0"
              onClick={handleDelete}
              disabled={singleDeleting}
            >
              {singleDeleting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Excluindo...</>
              ) : (
                <><Trash2 className="w-4 h-4" /> Excluir</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Excluir lançamentos
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-sm text-zinc-300">
              Tem certeza que deseja excluir{" "}
              <span className="font-bold text-white">{selectedIds.size}</span>{" "}
              {selectedIds.size === 1 ? "lançamento" : "lançamentos"}?
            </p>
            <p className="text-xs text-zinc-500">Esta ação não pode ser desfeita.</p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkDeleteOpen(false)}
              disabled={bulkDeleting}
            >
              Cancelar
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white border-0"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
            >
              {bulkDeleting ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Excluindo...</>
              ) : (
                <><Trash2 className="w-4 h-4" /> Excluir {selectedIds.size}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TransactionModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        transaction={editingTransaction}
        onSuccess={fetchTransactions}
      />
    </>
  );
}
