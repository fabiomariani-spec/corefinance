"use client";

import { useState, useEffect, useCallback, useRef, useTransition } from "react";
import dynamic from "next/dynamic";
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
// Lazy-load: modal pesado (dropzone, validação, currency input). Só carrega
// quando o user clica em "Novo lançamento" ou edita uma linha. Reduz o
// bundle inicial em ~40kb.
const TransactionModal = dynamic(
  () => import("@/components/transactions/transaction-modal").then(m => ({ default: m.TransactionModal })),
  { ssr: false }
);
import { CurrencyInput } from "@/components/ui/currency-input";
import { formatCurrency, formatDate, formatStatus } from "@/lib/formatters";
import { toDateStr } from "@/lib/dates";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Plus,
  Search,
  Loader2,
  ArrowUpCircle,
  ArrowDownCircle,
  ArrowLeftRight,
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
  X,
  SlidersHorizontal,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { downloadSpreadsheet } from "@/lib/export";
import { cachedFetch } from "@/lib/cached-fetch";
import { Download, MoreVertical } from "lucide-react";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { toast } from "@/lib/toast";
import { useClickOutside } from "@/lib/use-click-outside";
import { useDebounce } from "@/lib/use-debounce";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  employee?: { id: string; name: string } | null;
}

interface Employee { id: string; name: string; }

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
  incomeReceived?: number;
  incomeReceivedCount?: number;
  incomePending?: number;
  paidTodayExpense?: number;
  paidTodayExpenseCount?: number;
  paidTodayIncome?: number;
  paidTodayIncomeCount?: number;
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

const NOW = new Date();
const DEFAULT_FROM = toDateStr(new Date(NOW.getFullYear(), NOW.getMonth(), 1));
const DEFAULT_TO   = toDateStr(new Date(NOW.getFullYear(), NOW.getMonth() + 1, 0));

// Cabeçalho clicável de tabela com indicador de ordenação. Clica → alterna
// asc/desc. Quando ativo, mostra seta indigo + label indigo. Inativo: zinc-500
// + seta discreta sinalizando "ordenável".
function SortHeader({
  id,
  sortBy,
  sortOrder,
  onClick,
  align = "left",
  children,
}: {
  id: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
  onClick: (id: string) => void;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  const active = sortBy === id;
  return (
    <th className={`px-4 py-3 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onClick(id)}
        className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide transition-colors ${
          active ? "text-indigo-400" : "text-zinc-500 hover:text-zinc-200"
        }`}
        title={active
          ? `Ordenado: ${sortOrder === "asc" ? "crescente" : "decrescente"}`
          : `Ordenar`}
      >
        <span>{children}</span>
        {active ? (
          <ChevronDown className={`w-3 h-3 ${sortOrder === "asc" ? "rotate-180" : ""}`} />
        ) : (
          <ChevronDown className="w-3 h-3 opacity-30" />
        )}
      </button>
    </th>
  );
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  // `loading` é só na primeira carga — depois usamos `refetching` que mantém
  // a tabela visível e mostra um spinner discreto. Antes a tabela piscava
  // skeleton em cada keystroke, dando o efeito de "tentando adivinhar".
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  // useTransition marca filter updates como pendentes — assim o spinner aparece
  // IMEDIATAMENTE no clique do chip, sem esperar o useEffect rodar o fetch.
  const [isPending, startTransition] = useTransition();
  const [page, setPage] = useState(1);
  // Two-state search: `searchInput` drives the controlled <input/>, `search`
  // (debounced 300ms) triggers o fetch. Evita refetch a cada keystroke.
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 300);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>(DEFAULT_FROM);
  const [dateTo, setDateTo]     = useState<string>(DEFAULT_TO);
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [employees, setEmployees] = useState<Employee[]>([]);
  // Sort por coluna — clicar no header alterna asc/desc.
  const [sortBy, setSortBy] = useState<string>("competenceDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  // Download de TODOS os lançamentos filtrados (não só a página atual)
  const [downloading, setDownloading] = useState(false);
  function handleSort(field: string) {
    if (sortBy === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
    setPage(1);
  }
  const [summary, setSummary] = useState<Summary>({ expensePending: 0, expensePaid: 0, pendingByDepartment: [] });
  const [showDeptBreakdown, setShowDeptBreakdown] = useState(false);
  const deptDropdownRef = useClickOutside<HTMLDivElement>(showDeptBreakdown, () => setShowDeptBreakdown(false));
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Global keyboard shortcuts wiring.
  useEffect(() => {
    function onFocus() {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
    function onNew() {
      setEditingTransaction(null);
      setModalOpen(true);
    }
    window.addEventListener("shortcut:focus-search", onFocus);
    window.addEventListener("shortcut:open-new-transaction", onNew);
    return () => {
      window.removeEventListener("shortcut:focus-search", onFocus);
      window.removeEventListener("shortcut:open-new-transaction", onNew);
    };
  }, []);

  const [showMoreFilters, setShowMoreFilters] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Bulk-mode keyboard shortcuts: Esc cancela seleção, Delete dispara exclusão.
  // Goal-Gradient + Paradox of the Active User — atalhos visíveis no bulk bar.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ignora se foco está em campo de texto/input
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;
      if (isEditable) return;
      if (selectedIds.size === 0) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setSelectedIds(new Set());
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        requestBulkDelete();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds]);

  // Threshold acima do qual bulk delete pede confirmação por dialog.
  // <=5 vira undo direto via toast (mais rápido, ainda reversível).
  const BULK_UNDO_THRESHOLD = 5;

  // Quick-add inline row (ghost row no topo da tabela) — cria lançamento
  // mínimo (descrição + valor + tipo + data) sem abrir o modal de 3 steps.
  const todayStr = new Date().toISOString().split("T")[0];
  const [quickDesc, setQuickDesc] = useState("");
  const [quickAmount, setQuickAmount] = useState(0);
  const [quickType, setQuickType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [quickDate, setQuickDate] = useState<string>(todayStr);
  const [quickSaving, setQuickSaving] = useState(false);

  const quickCanSave = quickDesc.trim().length > 0 && quickAmount > 0 && !quickSaving;

  // Detecta se algum filtro está ativo — usado pelo empty state pra
  // diferenciar "DB vazio" (mostra CTA "criar primeiro") de "filtros zerou
  // resultados" (mostra CTA "limpar filtros").
  const hasActiveFilter =
    search.trim() !== "" ||
    typeFilter !== "all" ||
    statusFilter !== "all" ||
    departmentFilter !== "all" ||
    employeeFilter !== "all" ||
    dateFrom !== DEFAULT_FROM ||
    dateTo !== DEFAULT_TO;

  function clearAllFilters() {
    setSearchInput("");
    setTypeFilter("all");
    setStatusFilter("all");
    setDepartmentFilter("all");
    setEmployeeFilter("all");
    setDateFrom(DEFAULT_FROM);
    setDateTo(DEFAULT_TO);
    setPage(1);
  }

  function resetQuickRow() {
    setQuickDesc("");
    setQuickAmount(0);
    setQuickType("EXPENSE");
    setQuickDate(new Date().toISOString().split("T")[0]);
  }

  async function handleQuickAdd() {
    if (!quickCanSave) return;
    setQuickSaving(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: quickDesc.trim(),
          amount: quickAmount,
          type: quickType,
          status: "PENDING",
          dueDate: quickDate || null,
          competenceDate: quickDate || null,
        }),
      });
      if (res.ok) {
        resetQuickRow();
        fetchTransactions();
      }
    } finally {
      setQuickSaving(false);
    }
  }

  const limit = 20;

  // Fetch departments + employees once (cached em sessionStorage por 5min com
  // stale-while-revalidate — instantâneo na 2ª navegação)
  useEffect(() => {
    cachedFetch<Department[]>("/api/departments")
      .then((data) => setDepartments(Array.isArray(data) ? data : []))
      .catch(() => {});
    cachedFetch<{ employees: Employee[] }>("/api/employees")
      .then((data) => setEmployees(Array.isArray(data?.employees) ? data.employees : []))
      .catch(() => {});
  }, []);

  // Quando a busca debounced muda, volta pra página 1 — mantém UX previsível
  // (não faz sentido continuar na "página 5" depois de filtrar pra 3 results).
  useEffect(() => {
    setPage(1);
  }, [search]);

  const hasFetchedRef = useRef(false);
  // Aborta a request anterior quando uma nova é disparada — evita race
  // condition: digitar rápido fazia 2-3 fetches voarem juntas, e quem
  // chegasse por último ditava o conteúdo da tabela (mostrando 20 itens
  // por 1s antes de voltar pros 3 corretos).
  const abortRef = useRef<AbortController | null>(null);
  const fetchTransactions = useCallback(async () => {
    // Cancela request em vôo se houver
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Só mostra skeleton na primeira carga. Refetches mantêm dados visíveis
    // e indicam loading via `refetching` (spinner discreto na busca).
    if (!hasFetchedRef.current) setLoading(true);
    else setRefetching(true);
    try {
      const isPendingPayments = statusFilter === "PENDING_PAYMENTS";
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        ...(search && { search }),
        ...(dateFrom && { startDate: dateFrom }),
        ...(dateTo   && { endDate:   dateTo }),
        ...(departmentFilter !== "all" && { departmentId: departmentFilter }),
        ...(employeeFilter !== "all" && { employeeId: employeeFilter }),
        sortBy,
        sortOrder,
        ...(typeFilter !== "all" && !isPendingPayments && { type: typeFilter }),
        ...(isPendingPayments && { type: "EXPENSE", status: "PENDING,OVERDUE" }),
        ...(!isPendingPayments && statusFilter !== "all" && { status: statusFilter }),
      });
      const res = await fetch(`/api/transactions?${params}`, { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions.map((t: Transaction & { amount: string | number }) => ({
          ...t,
          amount: Number(t.amount),
        })));
        setTotal(data.total);
        if (data.summary) setSummary(data.summary);
      }
    } catch (err) {
      // AbortError é esperado quando a request é cancelada — ignoramos
      if ((err as Error)?.name !== "AbortError") throw err;
    } finally {
      // Só limpa loading se essa request não foi abortada (senão a próxima
      // já está rodando e vai limpar quando terminar)
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefetching(false);
        hasFetchedRef.current = true;
        markRefreshedRef.current?.();
      }
    }
  }, [page, search, typeFilter, statusFilter, dateFrom, dateTo, departmentFilter, employeeFilter, sortBy, sortOrder]);

  // ── Auto-refresh (5min + on tab focus). Filtros mudando já disparam refetch
  // pelo useEffect abaixo, então o hook simplesmente chama fetchTransactions
  // com os filtros atuais — sem sobrescrever o que o usuário acabou de digitar.
  const markRefreshedRef = useRef<(() => void) | null>(null);
  const { label: refreshLabel, markRefreshed: markRefreshedAR } = useAutoRefresh(() => {
    fetchTransactions();
  });
  markRefreshedRef.current = markRefreshedAR;

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
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Recria uma transação a partir de um snapshot (usado pelo undo).
  // Retorna void — o re-fetch reposiciona a row na lista.
  async function recreateTransaction(snapshot: Transaction) {
    const { id: _id, ...rest } = snapshot;
    void _id;
    const todayStr = new Date().toISOString().split("T")[0];
    const competence = rest.competenceDate ? rest.competenceDate.slice(0, 10) : todayStr;
    const due = rest.dueDate ? rest.dueDate.slice(0, 10) : null;
    const payment = rest.paymentDate ? rest.paymentDate.slice(0, 10) : null;
    const res = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: rest.description,
        amount: rest.amount,
        type: rest.type,
        status: rest.status,
        isPredicted: rest.isPredicted,
        // Não recria como recorrente — undo reverte só a row, sem propagar
        // pra criar 12 cópias futuras de novo. Mantém installmentNumber/Total
        // pra preservar contexto visual ("3/12").
        isRecurring: false,
        installmentNumber: rest.installmentNumber ?? null,
        installmentTotal: rest.installmentTotal ?? null,
        categoryId: rest.category?.id ?? null,
        departmentId: rest.department?.id ?? null,
        contactId: rest.contact?.id ?? null,
        accountId: rest.account?.id ?? null,
        creditCardId: rest.creditCard?.id ?? null,
        employeeId: rest.employee?.id ?? null,
        competenceDate: competence,
        dueDate: due,
        paymentDate: payment,
      }),
    });
    if (res.ok) fetchTransactions();
    else toast.error("Não foi possível desfazer — recarregue a página.");
  }

  // Delete único: otimista + toast com undo (5s). Sem dialog.
  // Se o usuário clicar "Desfazer", recria via POST /api/transactions.
  async function handleDeleteOptimistic(tx: Transaction) {
    // Optimistic: remove da UI imediatamente
    setTransactions((prev) => prev.filter((t) => t.id !== tx.id));
    setSelectedIds((prev) => {
      if (!prev.has(tx.id)) return prev;
      const next = new Set(prev);
      next.delete(tx.id);
      return next;
    });
    // Dispara delete no backend (não bloqueante — o usuário já tá vendo o toast)
    const deletePromise = fetch(`/api/transactions/${tx.id}`, { method: "DELETE" });
    deletePromise.catch(() => {
      // Falha rara — restaura visualmente e avisa
      toast.error("Erro ao excluir. Tente novamente.");
      fetchTransactions();
    });

    toast.success("Lançamento excluído.", {
      undo: () => {
        // Espera o delete terminar antes de recriar (evita race com unique index)
        deletePromise.finally(() => recreateTransaction(tx));
      },
    });
  }

  // Marca pago/recebido com undo. Salva paymentDate antiga pra reverter
  // caso o usuário desfaça.
  async function handleStatusUpdate(id: string, newStatus: string) {
    const tx = transactions.find((t) => t.id === id);
    const prevStatus = tx?.status ?? "PENDING";
    const prevPaymentDate = tx?.paymentDate ?? null;

    const paymentDate = (newStatus === "PAID" || newStatus === "RECEIVED")
      ? new Date().toISOString().split("T")[0]
      : null;

    // Otimista: atualiza a UI antes do round-trip
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: newStatus, paymentDate } : t))
    );

    const res = await fetch(`/api/transactions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, paymentDate }),
    });

    if (!res.ok) {
      // Reverte e avisa
      setTransactions((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: prevStatus, paymentDate: prevPaymentDate } : t))
      );
      toast.error("Erro ao atualizar status.");
      return;
    }

    const label = newStatus === "PAID" ? "Pago" : newStatus === "RECEIVED" ? "Recebido" : newStatus;
    toast.success(`Marcado como ${label}.`, {
      undo: async () => {
        // Otimista no rollback também
        setTransactions((prev) =>
          prev.map((t) => (t.id === id ? { ...t, status: prevStatus, paymentDate: prevPaymentDate } : t))
        );
        await fetch(`/api/transactions/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: prevStatus, paymentDate: prevPaymentDate }),
        });
        fetchTransactions();
      },
    });
  }

  // Bulk delete com undo (≤5 itens) ou via dialog (>5).
  // Em ambos os casos, faz o delete no backend e oferece undo no toast.
  async function performBulkDelete(ids: string[]) {
    // Snapshot pras possíveis recriações no undo
    const snapshots = transactions.filter((t) => ids.includes(t.id));
    setTransactions((prev) => prev.filter((t) => !ids.includes(t.id)));
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);

    const deletePromise = fetch("/api/transactions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    deletePromise.catch(() => {
      toast.error("Erro ao excluir. Tente novamente.");
      fetchTransactions();
    });

    toast.success(
      `${ids.length} ${ids.length === 1 ? "lançamento excluído" : "lançamentos excluídos"}.`,
      {
        undo: () => {
          deletePromise.finally(async () => {
            // Recria em paralelo — POST /api/transactions é um por request
            await Promise.all(snapshots.map(recreateTransaction));
            fetchTransactions();
          });
        },
      }
    );
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      await performBulkDelete([...selectedIds]);
    } finally {
      setBulkDeleting(false);
    }
  }

  function requestBulkDelete() {
    if (selectedIds.size === 0) return;
    if (selectedIds.size <= BULK_UNDO_THRESHOLD) {
      // Direto pra undo — feedback rápido sem confirmação modal
      performBulkDelete([...selectedIds]);
    } else {
      // Volume maior — confirma via dialog antes de executar
      setBulkDeleteOpen(true);
    }
  }

  async function handleDuplicate(tx: Transaction) {
    const { id: _id, ...rest } = tx;
    void _id;
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
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Movimento de Hoje (pagamentos efetivados — saídas E entradas) */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600/15 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-zinc-500">Pagos Hoje</p>
              <p className="text-lg font-bold text-indigo-400 truncate">
                {formatCurrency(summary.paidTodayExpense ?? 0)}
              </p>
              {(summary.paidTodayIncome ?? 0) > 0 && (
                <p className="text-[10px] text-zinc-500 truncate">
                  +{formatCurrency(summary.paidTodayIncome ?? 0)} recebido
                </p>
              )}
              {(summary.paidTodayExpenseCount ?? 0) > 0 && (summary.paidTodayIncome ?? 0) === 0 && (
                <p className="text-[10px] text-zinc-500 truncate">
                  {summary.paidTodayExpenseCount} {summary.paidTodayExpenseCount === 1 ? "lançamento" : "lançamentos"}
                </p>
              )}
            </div>
          </div>

          {/* Vendas Recebidas (entradas no período) */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-600/15 flex items-center justify-center shrink-0">
              <ArrowUpCircle className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-zinc-500">Vendas Recebidas</p>
              <p className="text-lg font-bold text-emerald-400 truncate">
                {formatCurrency(summary.incomeReceived ?? 0)}
              </p>
              {(summary.incomePending ?? 0) > 0 && (
                <p className="text-[10px] text-zinc-500 truncate">
                  +{formatCurrency(summary.incomePending ?? 0)} a receber
                </p>
              )}
            </div>
          </div>

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
                ref={searchInputRef}
                placeholder="Buscar lançamentos..."
                className="pl-9 pr-9"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              {(refetching || isPending) && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-indigo-400 animate-spin" />
              )}
            </div>

            {/* Date range picker — com presets rápidos inline */}
            <DateRangePicker
              from={dateFrom}
              to={dateTo}
              onChange={(f, t) => startTransition(() => { setDateFrom(f); setDateTo(t); setPage(1); })}
              quickPresets
            />

            {/* More Filters toggle (departamento + colaborador) */}
            <button
              onClick={() => setShowMoreFilters((v) => !v)}
              className={`flex items-center gap-1.5 h-10 px-3 rounded-md border text-sm transition-colors whitespace-nowrap ${
                showMoreFilters || departmentFilter !== "all" || employeeFilter !== "all"
                  ? "border-indigo-500/50 bg-indigo-600/10 text-indigo-300"
                  : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filtros
              {(departmentFilter !== "all" || employeeFilter !== "all") && (
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-semibold">
                  {[departmentFilter !== "all", employeeFilter !== "all"].filter(Boolean).length}
                </span>
              )}
            </button>

            {/* Export ALL filtered records to CSV (não só a página atual) */}
            <Button
              variant="outline"
              onClick={async () => {
                setDownloading(true);
                try {
                  const isPendingPayments = statusFilter === "PENDING_PAYMENTS";
                  const params = new URLSearchParams({
                    page: "1",
                    limit: "10000", // pega tudo que bater os filtros
                    ...(search && { search }),
                    ...(dateFrom && { startDate: dateFrom }),
                    ...(dateTo   && { endDate:   dateTo }),
                    ...(departmentFilter !== "all" && { departmentId: departmentFilter }),
                    ...(employeeFilter !== "all" && { employeeId: employeeFilter }),
                    ...(typeFilter !== "all" && !isPendingPayments && { type: typeFilter }),
                    ...(isPendingPayments && { type: "EXPENSE", status: "PENDING,OVERDUE" }),
                    ...(!isPendingPayments && statusFilter !== "all" && { status: statusFilter }),
                    sortBy,
                    sortOrder,
                  });
                  const res = await fetch(`/api/transactions?${params}`);
                  const data = await res.json();
                  const all: Transaction[] = (data.transactions ?? []).map(
                    (t: Transaction & { amount: string | number }) => ({ ...t, amount: Number(t.amount) })
                  );
                  const headers = [
                    "Colaborador",
                    "Descrição",
                    "Categoria",
                    "Departamento",
                    "Tipo",
                    "Status",
                    "Vencimento",
                    "Pagamento",
                    "Competência",
                    "Valor",
                  ];
                  const rows = all.map((tx) => [
                    tx.employee?.name ?? "",
                    tx.description,
                    tx.category?.name ?? "",
                    tx.department?.name ?? "",
                    tx.type === "INCOME" ? "Entrada" : "Saída",
                    formatStatus(tx.status),
                    tx.dueDate ? new Date(tx.dueDate) : "",
                    tx.paymentDate ? new Date(tx.paymentDate) : "",
                    tx.competenceDate ? new Date(tx.competenceDate) : "",
                    (tx.type === "INCOME" ? 1 : -1) * tx.amount,
                  ]);
                  const today = new Date().toISOString().slice(0, 10);
                  downloadSpreadsheet(`lancamentos-${today}`, headers, rows);
                } finally {
                  setDownloading(false);
                }
              }}
              disabled={loading || downloading || total === 0}
              className="text-zinc-300 border-zinc-700"
              title={`Baixar ${total} lançamento${total === 1 ? "" : "s"}`}
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {downloading ? "Baixando..." : `Baixar (${total})`}
            </Button>

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

          {/* Inline chips: Tipo + Status — sempre visíveis pra reduzir cliques */}
          <div className="flex items-center gap-4 flex-wrap pl-1">
            {/* Tipo */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mr-1">Tipo</span>
              {[
                { value: "all", label: "Todos" },
                { value: "INCOME", label: "Entradas" },
                { value: "EXPENSE", label: "Saídas" },
              ].map((opt) => {
                const active = typeFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => startTransition(() => { setTypeFilter(opt.value); setPage(1); })}
                    className={`h-8 px-3 text-xs rounded-full border transition-colors whitespace-nowrap ${
                      active
                        ? "bg-indigo-600/20 text-indigo-300 border-indigo-600/40"
                        : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* Status */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mr-1">Status</span>
              {[
                { value: "all", label: "Todos" },
                { value: "PENDING", label: "Pendentes" },
                { value: "OVERDUE", label: "Atrasados" },
                { value: "PAID", label: "Pagos" },
                { value: "RECEIVED", label: "Recebidos" },
                { value: "PREDICTED", label: "Previsto" },
                { value: "CANCELLED", label: "Cancelados" },
              ].map((opt) => {
                const active = statusFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => startTransition(() => { setStatusFilter(opt.value); setPage(1); })}
                    className={`h-8 px-3 text-xs rounded-full border transition-colors whitespace-nowrap ${
                      active
                        ? "bg-indigo-600/20 text-indigo-300 border-indigo-600/40"
                        : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Extended Filters — progressive disclosure (departamento + colaborador) */}
          {showMoreFilters && (
            <div className="flex items-center gap-3 flex-wrap pl-1 animate-in fade-in slide-in-from-top-2 duration-200">
              {/* Departamento */}
              <Select value={departmentFilter} onValueChange={(v) => startTransition(() => { setDepartmentFilter(v); setPage(1); })}>
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

              {/* Colaborador (com busca por nome) */}
              <div className="w-56">
                <SearchableSelect
                  value={employeeFilter === "all" ? "" : employeeFilter}
                  onChange={(v) => startTransition(() => { setEmployeeFilter(v || "all"); setPage(1); })}
                  options={employees.map((e) => ({ value: e.id, label: e.name }))}
                  placeholder="Colaborador"
                  allowEmpty
                  emptyLabel="Todos os colaboradores"
                />
              </div>

              {/* Clear drawer filters */}
              {(departmentFilter !== "all" || employeeFilter !== "all") && (
                <button
                  onClick={() => { setDepartmentFilter("all"); setEmployeeFilter("all"); setPage(1); }}
                  className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Limpar filtros
                </button>
              )}
            </div>
          )}
        </div>

        {/* Bulk Action Bar — visible when items are selected. Suporta
            atalhos de teclado: Esc limpa seleção, Delete dispara exclusão. */}
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-600/10 border border-indigo-600/30 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white shrink-0 transition-transform animate-in zoom-in duration-200">
                {selectedIds.size}
              </div>
              <span className="text-sm text-indigo-300 font-medium">
                {selectedIds.size === 1 ? "1 lançamento selecionado" : `${selectedIds.size} lançamentos selecionados`}
              </span>
              <span className="hidden md:inline-flex items-center gap-2 text-[10px] text-zinc-500 ml-2">
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 font-mono text-[10px]">Esc</kbd>
                <span>cancela</span>
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 font-mono text-[10px]">Del</kbd>
                <span>excluir</span>
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
                onClick={requestBulkDelete}
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
                  <SortHeader id="employee"      sortBy={sortBy} sortOrder={sortOrder} onClick={handleSort}>Colaborador</SortHeader>
                  <SortHeader id="description"   sortBy={sortBy} sortOrder={sortOrder} onClick={handleSort}>Descrição</SortHeader>
                  <SortHeader id="category"      sortBy={sortBy} sortOrder={sortOrder} onClick={handleSort}>Categoria</SortHeader>
                  <SortHeader id="department"    sortBy={sortBy} sortOrder={sortOrder} onClick={handleSort}>Departamento</SortHeader>
                  <SortHeader id="dueDate"       sortBy={sortBy} sortOrder={sortOrder} onClick={handleSort}>Vencimento</SortHeader>
                  <SortHeader id="paymentDate"   sortBy={sortBy} sortOrder={sortOrder} onClick={handleSort}>Pagamento</SortHeader>
                  <SortHeader id="status"        sortBy={sortBy} sortOrder={sortOrder} onClick={handleSort}>Status</SortHeader>
                  <SortHeader id="amount"        sortBy={sortBy} sortOrder={sortOrder} onClick={handleSort} align="right">Valor Total</SortHeader>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {/* Quick-add ghost row — criação rápida sem abrir o modal.
                    Habilita "+" só quando descrição + valor preenchidos.
                    Enter em qualquer campo também salva. */}
                {!loading && (
                  <tr className="border-b border-zinc-800/50 bg-zinc-900/40 hover:bg-zinc-800/20 transition-colors">
                    <td className="px-4 py-2 w-10">
                      <Plus className="w-4 h-4 text-zinc-600" />
                    </td>
                    <td className="px-4 py-2" />
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={quickDesc}
                        onChange={(e) => setQuickDesc(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleQuickAdd(); }}
                        placeholder="+ Adicionar lançamento rápido..."
                        className="w-full bg-transparent border-0 border-b border-dashed border-zinc-700 focus:border-indigo-500 focus:outline-none text-sm text-zinc-100 placeholder:text-zinc-500 py-1"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <CurrencyInput
                        compact
                        value={quickAmount}
                        onChange={setQuickAmount}
                        onKeyDown={(e) => { if (e.key === "Enter") handleQuickAdd(); }}
                        placeholder="0,00"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={quickType}
                        onChange={(e) => setQuickType(e.target.value as "INCOME" | "EXPENSE")}
                        className="h-7 px-2 text-xs rounded border border-zinc-700 bg-zinc-800/50 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="EXPENSE">Saída</option>
                        <option value="INCOME">Entrada</option>
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="date"
                        value={quickDate}
                        onChange={(e) => setQuickDate(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleQuickAdd(); }}
                        className="h-7 px-2 text-xs rounded border border-zinc-700 bg-zinc-800/50 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-4 py-2" />
                    <td className="px-4 py-2" />
                    <td className="px-4 py-2" />
                    <td className="px-4 py-2">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleQuickAdd}
                          disabled={!quickCanSave}
                          title={quickCanSave ? "Adicionar (Enter)" : "Preencha descrição e valor"}
                          className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                            quickCanSave
                              ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-600/30"
                              : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                          }`}
                        >
                          {quickSaving ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Plus className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-zinc-800/50">
                      {Array.from({ length: 10 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 skeleton rounded" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-0 py-0">
                      {hasActiveFilter ? (
                        <EmptyState
                          icon={Search}
                          title="Nenhum lançamento corresponde aos filtros"
                          description="Tente ajustar a busca ou limpar os filtros pra ver tudo."
                          actionLabel={
                            <>
                              <X className="w-4 h-4" /> Limpar filtros
                            </>
                          }
                          onAction={clearAllFilters}
                          actionVariant="outline"
                        />
                      ) : (
                        <EmptyState
                          icon={ArrowLeftRight}
                          title="Sem lançamentos ainda"
                          description="Comece criando o primeiro lançamento da sua empresa."
                          actionLabel={
                            <>
                              <Plus className="w-4 h-4" /> Novo Lançamento
                            </>
                          }
                          onAction={() => {
                            setEditingTransaction(null);
                            setModalOpen(true);
                          }}
                        />
                      )}
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
                      {/* Colaborador (antes da descrição — pedido do financeiro pra leitura) */}
                      <td className="px-4 py-3">
                        {tx.employee ? (
                          <span className="text-zinc-200 text-sm font-medium truncate max-w-[160px] inline-block">
                            {tx.employee.name}
                          </span>
                        ) : (
                          <span className="text-zinc-600 text-xs">—</span>
                        )}
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
                        {tx.dueDate ? formatDate(tx.dueDate) : "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-400 text-xs">
                        {tx.paymentDate ? formatDate(tx.paymentDate) : "—"}
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
                        {/* Desktop: hover-reveal action buttons. Hitbox 36×36
                            (p-2 + ícone w-4 h-4) pra ficar mais perto dos 44px
                            recomendados por WCAG/Fitts em ações de linha. */}
                        <div className="hidden md:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { setEditingTransaction(tx); setModalOpen(true); }}
                            className="p-2 rounded-md hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors"
                            title="Editar"
                            aria-label="Editar lançamento"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDuplicate(tx)}
                            className="p-2 rounded-md hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors"
                            title="Duplicar"
                            aria-label="Duplicar lançamento"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteOptimistic(tx)}
                            className="p-2 rounded-md hover:bg-red-600/20 text-zinc-400 hover:text-red-400 transition-colors"
                            title="Excluir"
                            aria-label="Excluir lançamento"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        {/* Mobile / no-hover: kebab dropdown */}
                        <div className="md:hidden flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors"
                                aria-label="Ações"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem
                                onClick={() => { setEditingTransaction(tx); setModalOpen(true); }}
                              >
                                <Pencil className="w-3.5 h-3.5 mr-2" /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDuplicate(tx)}>
                                <Copy className="w-3.5 h-3.5 mr-2" /> Duplicar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDeleteOptimistic(tx)}
                                className="text-red-400 focus:text-red-300 focus:bg-red-500/10"
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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
                <span className="hidden sm:inline text-zinc-600 ml-2" title="Atualização automática a cada 5min">
                  • {refreshLabel}
                </span>
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

      {/* Bulk Delete Confirmation — só aparece quando >5 itens.
          Volumes menores viram undo direto via toast (ver requestBulkDelete). */}
      <ConfirmDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        title="Excluir lançamentos"
        confirmLabel={`Excluir ${selectedIds.size}`}
        loading={bulkDeleting}
        message={
          <>
            <p>
              Tem certeza que deseja excluir{" "}
              <span className="font-bold text-white">{selectedIds.size}</span>{" "}
              {selectedIds.size === 1 ? "lançamento" : "lançamentos"}?
            </p>
            <p className="text-xs text-zinc-500 mt-2">Você poderá desfazer por 5s após confirmar.</p>
          </>
        }
      />

      <TransactionModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        transaction={editingTransaction}
        onSuccess={fetchTransactions}
      />
    </>
  );
}
