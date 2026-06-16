"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Header } from "@/components/layout/header";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import {
  format,
  startOfDay,
  isBefore,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowUpCircle,
  ArrowDownCircle,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Wallet,
  Clock,
  Building2,
  BarChart3,
  Loader2,
} from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { downloadSpreadsheet } from "@/lib/export";
import { Download } from "lucide-react";
import { useAutoRefresh } from "@/lib/use-auto-refresh";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  category?: { name: string; color: string } | null;
  contact?: { name: string } | null;
}

interface ProjectionDay {
  date: string;
  dateLabel: string;
  balance: number;
  income: number;
  expense: number;
  isToday: boolean;
}

interface DailyBar {
  date: string;
  dateLabel: string;
  income: number;
  expenses: number;
  isToday: boolean;
}

interface MonthSummary {
  income: number;
  expenses: number;
  predictedIncome: number;
  predictedExpenses: number;
}

interface AccountBalance {
  id: string;
  name: string;
  balance: number;
  color: string | null;
  type: string;
}

interface CashFlowData {
  accountBalance: number;
  accounts: AccountBalance[];
  burnRate: number;
  avgDailyIncome: number;
  runway: number;
  totalReceivables: number;
  totalPayables: number;
  receivables: Transaction[];
  payables: Transaction[];
  projection: ProjectionDay[];
  firstNegativeDay: ProjectionDay | null;
  minProjectedBalance: number;
  monthSummary: MonthSummary;
  monthTransactions: Transaction[];
  dailyData: DailyBar[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface WeekGroup {
  key: string;
  label: string;
  sublabel: string;
  weekStart: Date;
  isOverdue: boolean;
  isNoDueDate: boolean;
  transactions: Transaction[];
  total: number;
}

function buildWeekGroups(txs: Transaction[]): WeekGroup[] {
  const today = startOfDay(new Date());
  const weekMap = new Map<string, WeekGroup>();
  let overdueGroup: WeekGroup | null = null;
  let noDueDateGroup: WeekGroup | null = null;

  for (const tx of txs) {
    if (!tx.dueDate) {
      if (!noDueDateGroup) {
        noDueDateGroup = {
          key: "__no_due__",
          label: "Sem Vencimento",
          sublabel: "",
          weekStart: new Date(8640000000000000),
          isOverdue: false,
          isNoDueDate: true,
          transactions: [],
          total: 0,
        };
      }
      noDueDateGroup.transactions.push(tx);
      noDueDateGroup.total += tx.amount;
      continue;
    }

    const due = startOfDay(new Date(tx.dueDate));
    const overdue = isBefore(due, today);

    if (overdue) {
      if (!overdueGroup) {
        overdueGroup = {
          key: "__overdue__",
          label: "Atrasados",
          sublabel: "Vencimento já passou",
          weekStart: new Date(-8640000000000000),
          isOverdue: true,
          isNoDueDate: false,
          transactions: [],
          total: 0,
        };
      }
      overdueGroup.transactions.push(tx);
      overdueGroup.total += tx.amount;
      continue;
    }

    const wStart = startOfWeek(due, { weekStartsOn: 0 });
    const wEnd = endOfWeek(due, { weekStartsOn: 0 });
    const wKey = format(wStart, "yyyy-'W'ww");

    if (!weekMap.has(wKey)) {
      const startFmt = format(wStart, "d", { locale: ptBR });
      const endFmt = format(wEnd, "d 'de' MMM", { locale: ptBR });
      const label = `${startFmt} – ${endFmt}`;
      const sublabel = format(wStart, "MMMM yyyy", { locale: ptBR });
      weekMap.set(wKey, {
        key: wKey,
        label,
        sublabel,
        weekStart: wStart,
        isOverdue: false,
        isNoDueDate: false,
        transactions: [],
        total: 0,
      });
    }
    const g = weekMap.get(wKey)!;
    g.transactions.push(tx);
    g.total += tx.amount;
  }

  const sorted = [...weekMap.values()].sort(
    (a, b) => a.weekStart.getTime() - b.weekStart.getTime()
  );
  const result: WeekGroup[] = [];
  if (overdueGroup) result.push(overdueGroup);
  result.push(...sorted);
  if (noDueDateGroup) result.push(noDueDateGroup);
  return result;
}

// ─── Pending Group Block (A Receber / A Pagar) ────────────────────────────────

function PendingGroupBlock({
  group,
  variant,
  updatingId,
  onMark,
}: {
  group: WeekGroup;
  variant: "income" | "expense";
  updatingId: string | null;
  onMark: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const isIncome = variant === "income";

  const headerBg = group.isOverdue
    ? "bg-red-950/30 border-red-900/40"
    : isIncome
    ? "bg-emerald-950/20 border-emerald-900/30"
    : "bg-zinc-800/40 border-zinc-700/30";

  const headerText = group.isOverdue
    ? "text-red-400"
    : isIncome
    ? "text-emerald-400"
    : "text-amber-400";

  const amountColor = group.isOverdue
    ? "text-red-400"
    : isIncome
    ? "text-emerald-400"
    : "text-red-400";

  const iconBg = group.isOverdue
    ? "bg-red-600/20"
    : isIncome
    ? "bg-emerald-600/15"
    : "bg-amber-600/15";

  const badgeBg = group.isOverdue
    ? "bg-red-500/15 text-red-400"
    : isIncome
    ? "bg-emerald-500/15 text-emerald-400"
    : "bg-amber-500/15 text-amber-400";

  const icon = group.isOverdue ? (
    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
  ) : isIncome ? (
    <ArrowUpCircle className="w-3.5 h-3.5 text-emerald-400" />
  ) : (
    <CalendarDays className="w-3.5 h-3.5 text-amber-400" />
  );

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-4 py-2.5 border-b ${headerBg} hover:brightness-110 transition-all`}
      >
        <div className="flex items-center gap-2.5">
          <div className={`w-6 h-6 rounded-md flex items-center justify-center ${iconBg}`}>
            {icon}
          </div>
          <div className="text-left">
            <p className={`text-xs font-bold ${headerText}`}>{group.label}</p>
            {group.sublabel && (
              <p className="text-xs text-zinc-600 capitalize">{group.sublabel}</p>
            )}
          </div>
          <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${badgeBg}`}>
            {group.transactions.length}{" "}
            {group.transactions.length === 1 ? "lançamento" : "lançamentos"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${amountColor}`}>
            {isIncome ? "+" : "-"}
            {formatCurrency(group.total)}
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {open && (
        <div className="divide-y divide-zinc-800/30">
          {group.transactions.map((tx) => {
            const isOverdue =
              group.isOverdue ||
              (tx.dueDate &&
                isBefore(startOfDay(new Date(tx.dueDate)), startOfDay(new Date())));
            return (
              <div
                key={tx.id}
                className="flex items-center justify-between px-4 py-3 pl-8 hover:bg-zinc-800/20 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      isOverdue
                        ? "bg-red-600/15"
                        : isIncome
                        ? "bg-emerald-600/10"
                        : "bg-zinc-800"
                    }`}
                  >
                    {tx.isRecurring ? (
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${
                          isOverdue
                            ? "text-red-400"
                            : isIncome
                            ? "text-emerald-400"
                            : "text-zinc-400"
                        }`}
                      />
                    ) : isIncome ? (
                      <ArrowUpCircle
                        className={`w-3.5 h-3.5 ${
                          isOverdue ? "text-red-400" : "text-emerald-400"
                        }`}
                      />
                    ) : (
                      <ArrowDownCircle
                        className={`w-3.5 h-3.5 ${
                          isOverdue ? "text-red-400" : "text-zinc-400"
                        }`}
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-100 truncate">
                      {tx.description}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {tx.dueDate && (
                        <span
                          className={`text-xs ${
                            isOverdue ? "text-red-400 font-semibold" : "text-zinc-500"
                          }`}
                        >
                          {isIncome ? "Receber" : "Vence"}{" "}
                          {formatDate(tx.dueDate)}
                          {isOverdue ? " · atrasado" : ""}
                        </span>
                      )}
                      {tx.contact && (
                        <span className="text-xs text-zinc-500">
                          {tx.contact.name}
                        </span>
                      )}
                      {tx.isRecurring &&
                        tx.installmentNumber &&
                        tx.installmentTotal && (
                          <span className="text-xs text-indigo-400 font-medium">
                            {tx.installmentNumber}/{tx.installmentTotal}
                          </span>
                        )}
                      {tx.category && (
                        <span className="flex items-center gap-1 text-xs text-zinc-500">
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: tx.category.color }}
                          />
                          {tx.category.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <span
                    className={`text-sm font-semibold ${
                      isIncome ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {isIncome ? "+" : "-"}
                    {formatCurrency(tx.amount)}
                  </span>
                  <button
                    onClick={() => onMark(tx.id)}
                    disabled={updatingId === tx.id}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                      isIncome
                        ? "bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400"
                        : "bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400"
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {updatingId === tx.id
                      ? "..."
                      : isIncome
                      ? "Recebido"
                      : "Pago"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function ProjectionTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const balance = payload[0]?.value ?? 0;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-zinc-400 mb-1.5 font-medium">{label}</p>
      <p className={`font-bold text-sm ${balance >= 0 ? "text-indigo-400" : "text-red-400"}`}>
        {formatCurrency(balance)}
      </p>
      {payload.find((p) => p.name === "Entradas") && (
        <p className="text-emerald-400 mt-1">
          +{formatCurrency(payload.find((p) => p.name === "Entradas")?.value ?? 0)}
        </p>
      )}
      {payload.find((p) => p.name === "Saídas") && (
        <p className="text-red-400">
          -{formatCurrency(payload.find((p) => p.name === "Saídas")?.value ?? 0)}
        </p>
      )}
    </div>
  );
}

// ─── Runway Badge ─────────────────────────────────────────────────────────────

function RunwayBadge({ days }: { days: number }) {
  if (days >= 365) return <span className="text-xs text-zinc-500">365+ dias</span>;
  const color =
    days >= 90 ? "text-emerald-400" : days >= 30 ? "text-amber-400" : "text-red-400";
  return (
    <span className={`text-xs font-medium ${color}`}>
      {days} {days === 1 ? "dia" : "dias"}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FluxoCaixaPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [data, setData] = useState<CashFlowData | null>(null);
  // `loading` apenas na primeira carga; `refetching` mantém dados visíveis
  // ao trocar mês/range/marcar pago — só mostra spinner discreto no header.
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const hasFetchedRef = useRef(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  // Filtro por range custom. Quando vazio, cai no `month` do header (mês atual).
  // O sentinel vazio é mantido pra preservar a lógica de filtro (modo mês vs
  // custom). A UI exibe o mês corrente como default (ver `pickerFrom/To`) pra
  // não parecer que exige config (Lei de Tesler).
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // Sort do extrato
  type SortKey =
    | "date"
    | "payment"
    | "description"
    | "category"
    | "status"
    | "income"
    | "expense"
    | "balance";
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function toggleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
  }

  const hasCustomRange = Boolean(dateFrom && dateTo);

  // Default exibido no picker quando não há range custom: mês corrente do
  // Header. Mantém o sentinel vazio internamente (lógica de filtro intacta),
  // mas mostra datas reais em vez de "Início → Fim" (Lei de Tesler).
  const pickerFrom = dateFrom || format(startOfMonth(currentDate), "yyyy-MM-dd");
  const pickerTo = dateTo || format(endOfMonth(currentDate), "yyyy-MM-dd");

  const fetchData = useCallback(() => {
    if (!hasFetchedRef.current) setLoading(true);
    else setRefetching(true);
    const params =
      dateFrom && dateTo
        ? `startDate=${dateFrom}&endDate=${dateTo}`
        : `month=${format(currentDate, "yyyy-MM")}`;
    fetch(`/api/cash-flow?${params}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => {
        setLoading(false);
        setRefetching(false);
        hasFetchedRef.current = true;
        markRefreshedRef.current?.();
      });
  }, [currentDate, dateFrom, dateTo]);

  // ── Auto-refresh (5min + on tab focus) ────────────────────────────────────
  const markRefreshedRef = useRef<(() => void) | null>(null);
  const { label: refreshLabel, markRefreshed } = useAutoRefresh(fetchData);
  markRefreshedRef.current = markRefreshed;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/on-month-change
    fetchData();
  }, [fetchData]);

  async function markAs(id: string, status: "PAID" | "RECEIVED") {
    setUpdatingId(id);
    await fetch(`/api/transactions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        paymentDate: new Date().toISOString().split("T")[0],
      }),
    });
    setUpdatingId(null);
    fetchData();
  }

  const payableGroups = data ? buildWeekGroups(data.payables) : [];
  const receivableGroups = data ? buildWeekGroups(data.receivables) : [];

  const today = format(new Date(), "dd/MM");

  // Derived metrics
  const netLiquidPosition = data
    ? data.totalReceivables - data.totalPayables
    : 0;

  const monthResult = data
    ? (data.monthSummary.income + data.monthSummary.predictedIncome) -
      (data.monthSummary.expenses + data.monthSummary.predictedExpenses)
    : 0;

  // Projection x-axis: only show a few labels to avoid crowding
  const projectionLabels = data
    ? data.projection.filter((_, i) => i === 0 || (i + 1) % 10 === 0 || i === data.projection.length - 1)
    : [];
  void projectionLabels; // used via tick formatter

  // ── Extrato: saldo acumulado + ordenação (memoizado) ───────────────────────
  // Perf P0: antes esses 2 sorts O(n log n) + o loop de saldo rodavam A CADA
  // render (toda re-renderização da página). Agora só recalcula quando mudam as
  // transações ou o critério/direção de ordenação. Mesma saída, só memoizada.
  const { sortedTransactions, balanceMap } = useMemo(() => {
    const txs = data?.monthTransactions ?? [];
    // Saldo corrente sempre em ordem cronológica (consistência da coluna Saldo).
    const chronological = [...txs].sort((a, b) => {
      const dateA = new Date(a.paymentDate ?? a.dueDate ?? a.competenceDate).getTime();
      const dateB = new Date(b.paymentDate ?? b.dueDate ?? b.competenceDate).getTime();
      return dateA - dateB;
    });
    const map = new Map<string, number>();
    let rb = 0;
    for (const tx of chronological) {
      if (tx.type === "INCOME") rb += tx.amount;
      else rb -= tx.amount;
      map.set(tx.id, rb);
    }

    const dirMul = sortDir === "asc" ? 1 : -1;
    const cmpStr = (a: string, b: string) =>
      a.localeCompare(b, "pt-BR", { sensitivity: "base" });
    const txDate = (t: Transaction) =>
      new Date(t.dueDate ?? t.paymentDate ?? t.competenceDate).getTime();
    const txPayment = (t: Transaction) =>
      t.paymentDate ? new Date(t.paymentDate).getTime() : Number.POSITIVE_INFINITY;

    const sorted = [...chronological].sort((a, b) => {
      switch (sortBy) {
        case "date":
          return (txDate(a) - txDate(b)) * dirMul;
        case "payment":
          return (txPayment(a) - txPayment(b)) * dirMul;
        case "description":
          return cmpStr(a.description, b.description) * dirMul;
        case "category":
          return cmpStr(a.category?.name ?? "", b.category?.name ?? "") * dirMul;
        case "status":
          return cmpStr(a.status, b.status) * dirMul;
        case "income": {
          const ai = a.type === "INCOME" ? a.amount : 0;
          const bi = b.type === "INCOME" ? b.amount : 0;
          return (ai - bi) * dirMul;
        }
        case "expense": {
          const ax = a.type === "EXPENSE" ? a.amount : 0;
          const bx = b.type === "EXPENSE" ? b.amount : 0;
          return (ax - bx) * dirMul;
        }
        case "balance":
          return ((map.get(a.id) ?? 0) - (map.get(b.id) ?? 0)) * dirMul;
        default:
          return 0;
      }
    });
    return { sortedTransactions: sorted, balanceMap: map };
  }, [data?.monthTransactions, sortBy, sortDir]);

  return (
    <>
      <Header
        title="Fluxo de Caixa"
        subtitle="Liquidez, projeção e gestão de recebíveis"
        showDateNav={!hasCustomRange}
        currentDate={currentDate}
        onDateChange={setCurrentDate}
      />

      <div className="flex-1 p-6 space-y-5">

        {/* Filtro por intervalo de datas */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <DateRangePicker
              from={pickerFrom}
              to={pickerTo}
              onChange={(f, t) => {
                setDateFrom(f);
                setDateTo(t);
              }}
            />
            {refetching && (
              <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
            )}
            <span
              className={`text-xs px-2 py-1 rounded-md border ${
                hasCustomRange
                  ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
                  : "bg-zinc-800/60 border-zinc-700/60 text-zinc-400"
              }`}
            >
              {hasCustomRange
                ? `Modo: período custom [${format(new Date(dateFrom + "T12:00:00"), "dd/MM")} - ${format(new Date(dateTo + "T12:00:00"), "dd/MM")}]`
                : `Modo: mês [${format(currentDate, "MMMM yyyy", { locale: ptBR }).replace(/^./, (c) => c.toUpperCase())}]`}
            </span>
          </div>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
              className="text-xs text-zinc-400 hover:text-white transition-colors"
            >
              Limpar e usar mês do cabeçalho
            </button>
          )}
          <span
            className="ml-auto text-xs text-zinc-600 hidden sm:inline"
            title="Atualização automática a cada 5min"
          >
            {refreshLabel}
          </span>
        </div>

        {/* ── 1. Painel de Liquidez ─────────────────────────────────────── */}
        <div
          className={`grid grid-cols-2 lg:grid-cols-5 gap-3 ${
            refetching ? "opacity-50 pointer-events-none transition-opacity" : "transition-opacity"
          }`}
        >

          {/* Saldo em Caixa */}
          <div className="col-span-2 lg:col-span-1 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-600/15 flex items-center justify-center">
                <Wallet className="w-4 h-4 text-indigo-400" />
              </div>
              <span className="text-xs text-zinc-500 flex items-center gap-1">
                Saldo em Caixa
                <InfoTooltip size="sm" text="Soma dos saldos de todas as contas bancárias hoje. É o dinheiro que você tem disponível agora." />
              </span>
            </div>
            {loading ? (
              <div className="h-7 skeleton rounded w-32 mb-2" />
            ) : (
              <p
                className={`text-2xl font-bold ${
                  (data?.accountBalance ?? 0) >= 0 ? "text-zinc-100" : "text-red-400"
                }`}
              >
                {formatCurrency(data?.accountBalance ?? 0)}
              </p>
            )}
            {/* Account breakdown */}
            {!loading && data && data.accounts.length > 0 && (
              <div className="mt-2 space-y-1">
                {data.accounts.slice(0, 3).map((acc) => (
                  <div key={acc.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: acc.color ?? "#6366f1" }}
                      />
                      <span className="text-xs text-zinc-500 truncate">{acc.name}</span>
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        acc.balance >= 0 ? "text-zinc-400" : "text-red-400"
                      }`}
                    >
                      {formatCurrency(acc.balance, { compact: true })}
                    </span>
                  </div>
                ))}
                {data.accounts.length > 3 && (
                  <p className="text-xs text-zinc-600">
                    +{data.accounts.length - 3} conta(s)
                  </p>
                )}
              </div>
            )}
          </div>

          {/* A Receber */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <ArrowUpCircle className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-zinc-500 flex items-center gap-1">
                Total a Receber
                <InfoTooltip size="sm" text="Lançamentos pendentes ou a receber programados (entradas) — soma de tudo que ainda vai entrar." />
              </span>
            </div>
            {loading ? (
              <div className="h-6 skeleton rounded w-24" />
            ) : (
              <p className="text-xl font-bold text-emerald-400">
                {formatCurrency(data?.totalReceivables ?? 0)}
              </p>
            )}
            {!loading && data && (
              <p className="text-xs text-zinc-600 mt-1">
                {data.receivables.length}{" "}
                {data.receivables.length === 1 ? "recebível" : "recebíveis"}
              </p>
            )}
          </div>

          {/* A Pagar */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <ArrowDownCircle className="w-4 h-4 text-red-400" />
              <span className="text-xs text-zinc-500 flex items-center gap-1">
                Total a Pagar
                <InfoTooltip size="sm" text="Lançamentos pendentes ou em atraso programados (saídas) — soma de tudo que ainda precisa ser pago." />
              </span>
            </div>
            {loading ? (
              <div className="h-6 skeleton rounded w-24" />
            ) : (
              <p className="text-xl font-bold text-red-400">
                {formatCurrency(data?.totalPayables ?? 0)}
              </p>
            )}
            {!loading && data && (
              <p className="text-xs text-zinc-600 mt-1">
                {data.payables.length}{" "}
                {data.payables.length === 1 ? "pagamento" : "pagamentos"}
              </p>
            )}
          </div>

          {/* Posição Líquida */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              {netLiquidPosition >= 0 ? (
                <TrendingUp className="w-4 h-4 text-violet-400" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-400" />
              )}
              <span className="text-xs text-zinc-500 flex items-center gap-1">
                Posição Líquida
                <InfoTooltip size="sm" text="A receber menos a pagar. Quanto sobra (ou falta) no curto prazo se todos os lançamentos forem cumpridos." />
              </span>
            </div>
            {loading ? (
              <div className="h-6 skeleton rounded w-24" />
            ) : (
              <p
                className={`text-xl font-bold ${
                  netLiquidPosition >= 0 ? "text-violet-400" : "text-red-400"
                }`}
              >
                {formatCurrency(netLiquidPosition)}
              </p>
            )}
            <p className="text-xs text-zinc-600 mt-1">A Receber - A Pagar</p>
          </div>

          {/* Runway */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock
                className={`w-4 h-4 ${
                  (data?.runway ?? 365) >= 90
                    ? "text-emerald-400"
                    : (data?.runway ?? 365) >= 30
                    ? "text-amber-400"
                    : "text-red-400"
                }`}
              />
              <span className="text-xs text-zinc-500 flex items-center gap-1">
                Runway
                <InfoTooltip size="sm" text="Quantos dias a empresa aguenta no caixa atual mantendo o burn rate diário. Verde >90d, amarelo 30-90d, vermelho <30d." />
              </span>
            </div>
            {loading ? (
              <div className="h-6 skeleton rounded w-16" />
            ) : (
              <p
                className={`text-xl font-bold ${
                  (data?.runway ?? 365) >= 90
                    ? "text-emerald-400"
                    : (data?.runway ?? 365) >= 30
                    ? "text-amber-400"
                    : "text-red-400"
                }`}
              >
                {data?.runway === 365 ? "365+" : data?.runway ?? "—"}{" "}
                <span className="text-sm font-normal text-zinc-500">dias</span>
              </p>
            )}
            {!loading && data && (
              <p className="text-xs text-zinc-600 mt-1">
                Burn: {formatCurrency(data.burnRate, { compact: true })}/dia
              </p>
            )}
          </div>
        </div>

        {/* ── 2. Alertas ───────────────────────────────────────────────── */}
        {!loading && data && (
          <>
            {data.runway < 30 && data.runway > 0 && (
              <div className="flex items-start gap-3 bg-red-950/40 border border-red-900/50 rounded-xl px-4 py-3">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-300">
                    Atenção: caixa crítico
                  </p>
                  <p className="text-xs text-red-400/80 mt-0.5">
                    Com o burn rate atual de{" "}
                    {formatCurrency(data.burnRate, { compact: true })}/dia, o saldo
                    disponível cobre apenas{" "}
                    <strong>{data.runway} {data.runway === 1 ? "dia" : "dias"}</strong> de operação.
                    Acelere recebíveis ou reduza despesas imediatamente.
                  </p>
                </div>
              </div>
            )}
            {data.runway >= 30 && data.firstNegativeDay && (
              <div className="flex items-start gap-3 bg-amber-950/40 border border-amber-900/50 rounded-xl px-4 py-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-300">
                    Alerta de liquidez
                  </p>
                  <p className="text-xs text-amber-400/80 mt-0.5">
                    A projeção indica saldo negativo em{" "}
                    <strong>{formatDate(data.firstNegativeDay.date)}</strong> se os
                    vencimentos ocorrerem conforme previsto. Avalie adiantamento de
                    recebíveis ou renegociação de prazos.
                  </p>
                </div>
              </div>
            )}
            {data.payables.filter((p) => p.status === "OVERDUE").length > 0 && (
              <div className="flex items-start gap-3 bg-red-950/30 border border-red-900/40 rounded-xl px-4 py-3">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-300">
                    Pagamentos em atraso
                  </p>
                  <p className="text-xs text-red-400/80 mt-0.5">
                    Existem{" "}
                    <strong>
                      {data.payables.filter((p) => p.status === "OVERDUE").length}{" "}
                      pagamento(s) vencido(s)
                    </strong>{" "}
                    totalizando{" "}
                    {formatCurrency(
                      data.payables
                        .filter((p) => p.status === "OVERDUE")
                        .reduce((s, t) => s + t.amount, 0)
                    )}
                    . Regularize para evitar multas e juros.
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── 3. Projeção de Caixa (60 dias) ───────────────────────────── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5">
                Projeção de Caixa — 60 dias
                <InfoTooltip text="Saldo projetado para os próximos 60 dias. O ponto mais baixo é o 'saldo mínimo projetado' — o pior cenário se todos os recebíveis e pagamentos acontecerem no prazo." />
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Baseado nos vencimentos de recebíveis e pagamentos pendentes
              </p>
            </div>
            {!loading && data && data.firstNegativeDay && (
              <span className="text-xs px-2 py-1 bg-red-500/15 text-red-400 rounded-lg font-medium">
                Negativo em {formatDate(data.firstNegativeDay.date)}
              </span>
            )}
          </div>
          {!loading && (!data || data.projection.length === 0) ? (
            <div className="flex flex-col items-center justify-center text-zinc-600" style={{ height: 220 }}>
              <BarChart3 className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">Sem dados de projeção no período</p>
            </div>
          ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart
              data={data?.projection ?? []}
              margin={{ top: 10, right: 4, bottom: 0, left: 4 }}
            >
              <defs>
                <linearGradient id="projGradPos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="projGradNeg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="dateLabel"
                tick={{ fill: "#71717a", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                interval={9}
              />
              <YAxis
                tick={{ fill: "#71717a", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatCurrency(v, { compact: true })}
                width={60}
              />
              <Tooltip content={<ProjectionTooltip />} />
              {/* Zero reference */}
              <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1} />
              {/* Today reference */}
              <ReferenceLine
                x={today}
                stroke="#f59e0b"
                strokeWidth={1.5}
                label={{ value: "Hoje", fill: "#f59e0b", fontSize: 9, position: "insideTopRight" }}
              />
              {/* Negative zone */}
              {data && data.minProjectedBalance < 0 && (
                <ReferenceArea
                  y1={data.minProjectedBalance}
                  y2={0}
                  fill="rgba(239, 68, 68, 0.04)"
                />
              )}
              <Area
                type="monotone"
                dataKey="balance"
                name="Saldo Projetado"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#projGradPos)"
                dot={false}
                activeDot={{ r: 4, fill: "#6366f1" }}
              />
            </AreaChart>
          </ResponsiveContainer>
          )}
        </div>

        {/* ── 4. Resumo do Mês ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Entradas */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ArrowUpCircle className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-zinc-400 font-medium">Entradas do Mês</span>
              </div>
              <BarChart3 className="w-3.5 h-3.5 text-zinc-600" />
            </div>
            {loading ? (
              <div className="space-y-2">
                <div className="h-6 skeleton rounded w-28" />
                <div className="h-3 skeleton rounded w-full" />
              </div>
            ) : (
              <>
                <p className="text-xl font-bold text-emerald-400">
                  {formatCurrency(data?.monthSummary.income ?? 0)}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">realizadas</p>
                {(data?.monthSummary.predictedIncome ?? 0) > 0 && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-500">Previsto</span>
                      <span className="text-zinc-400">
                        {formatCurrency(data?.monthSummary.predictedIncome ?? 0)}
                      </span>
                    </div>
                    {/* Progress: realized / (realized + predicted) */}
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{
                          width: `${Math.min(
                            100,
                            data
                              ? (data.monthSummary.income /
                                  Math.max(
                                    1,
                                    data.monthSummary.income + data.monthSummary.predictedIncome
                                  )) *
                                  100
                              : 0
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Saídas */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ArrowDownCircle className="w-4 h-4 text-red-400" />
                <span className="text-xs text-zinc-400 font-medium">Saídas do Mês</span>
              </div>
              <BarChart3 className="w-3.5 h-3.5 text-zinc-600" />
            </div>
            {loading ? (
              <div className="space-y-2">
                <div className="h-6 skeleton rounded w-28" />
                <div className="h-3 skeleton rounded w-full" />
              </div>
            ) : (
              <>
                <p className="text-xl font-bold text-red-400">
                  {formatCurrency(data?.monthSummary.expenses ?? 0)}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">realizadas</p>
                {(data?.monthSummary.predictedExpenses ?? 0) > 0 && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-500">Previsto</span>
                      <span className="text-zinc-400">
                        {formatCurrency(data?.monthSummary.predictedExpenses ?? 0)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-500 rounded-full transition-all"
                        style={{
                          width: `${Math.min(
                            100,
                            data
                              ? (data.monthSummary.expenses /
                                  Math.max(
                                    1,
                                    data.monthSummary.expenses +
                                      data.monthSummary.predictedExpenses
                                  )) *
                                  100
                              : 0
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Resultado + Indicadores */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-400" />
                <span className="text-xs text-zinc-400 font-medium">Resultado do Mês</span>
              </div>
            </div>
            {loading ? (
              <div className="space-y-3">
                <div className="h-6 skeleton rounded w-28" />
                <div className="h-3 skeleton rounded w-20" />
                <div className="h-3 skeleton rounded w-24" />
              </div>
            ) : (
              <>
                <p
                  className={`text-xl font-bold ${
                    (data?.monthSummary.income ?? 0) -
                      (data?.monthSummary.expenses ?? 0) >=
                    0
                      ? "text-indigo-400"
                      : "text-red-400"
                  }`}
                >
                  {formatCurrency(
                    (data?.monthSummary.income ?? 0) -
                      (data?.monthSummary.expenses ?? 0)
                  )}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">saldo realizado</p>
                <div className="mt-3 space-y-1.5 pt-3 border-t border-zinc-800">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500 flex items-center gap-1">
                      Projeção final
                      <InfoTooltip size="sm" text="Resultado projetado considerando entradas + saídas realizadas e previstas até o fim do mês." />
                    </span>
                    <span
                      className={`font-medium ${
                        monthResult >= 0 ? "text-violet-400" : "text-red-400"
                      }`}
                    >
                      {formatCurrency(monthResult)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500 flex items-center gap-1">
                      Burn rate
                      <InfoTooltip size="sm" text="Velocidade que a empresa queima caixa por mês. Quanto sai a mais do que entra." />
                    </span>
                    <RunwayBadge days={data?.runway ?? 365} />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500 flex items-center gap-1">
                      Custo/dia
                      <InfoTooltip size="sm" text="Quanto a empresa gasta em média por dia. Calculado a partir do burn rate dos últimos 30 dias." />
                    </span>
                    <span className="text-zinc-400">
                      {formatCurrency(data?.burnRate ?? 0, { compact: true })}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── 5. Entradas e Saídas por Dia ─────────────────────────────── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-zinc-100 mb-4">
            Entradas e Saídas por Dia
          </h3>
          {!loading &&
          (!data ||
            data.dailyData.length === 0 ||
            data.dailyData.every((d) => d.income === 0 && d.expenses === 0)) ? (
            <div className="flex flex-col items-center justify-center text-zinc-600" style={{ height: 200 }}>
              <BarChart3 className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">Sem movimentações no período</p>
            </div>
          ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={data?.dailyData ?? []}
              margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="dateLabel"
                tick={{ fill: "#71717a", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                interval={4}
              />
              <YAxis
                tick={{ fill: "#71717a", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatCurrency(v, { compact: true })}
                width={60}
              />
              <Tooltip
                formatter={(value) => formatCurrency(value as number)}
                contentStyle={{
                  background: "#27272a",
                  border: "1px solid #3f3f46",
                  borderRadius: 8,
                  fontSize: 11,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} />
              {/* Daltonismo: além de verde/vermelho, diferencia por textura —
                  Entradas sólida, Saídas com hachura diagonal. */}
              <defs>
                <pattern
                  id="expenseHatch"
                  patternUnits="userSpaceOnUse"
                  width={6}
                  height={6}
                  patternTransform="rotate(45)"
                >
                  <rect width={6} height={6} fill="#ef4444" />
                  <line x1={0} y1={0} x2={0} y2={6} stroke="#7f1d1d" strokeWidth={2.5} />
                </pattern>
              </defs>
              <Bar dataKey="income" name="Entradas" fill="#10b981" radius={[2, 2, 0, 0]} />
              <Bar dataKey="expenses" name="Saídas" fill="url(#expenseHatch)" stroke="#ef4444" strokeWidth={0.5} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          )}
        </div>

        {/* ── 6. A Receber ─────────────────────────────────────────────── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowUpCircle className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-zinc-100">A Receber</h3>
              {!loading && data && data.receivables.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-semibold">
                  {data.receivables.length}
                </span>
              )}
            </div>
            {!loading && data && data.receivables.length > 0 && (
              <div className="text-right">
                <p className="text-xs text-zinc-500">Total previsto</p>
                <p className="text-sm font-bold text-emerald-400">
                  +{formatCurrency(data.totalReceivables)}
                </p>
              </div>
            )}
          </div>

          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-8 skeleton rounded-lg" />
                  <div className="h-12 skeleton rounded-lg ml-4" />
                </div>
              ))}
            </div>
          ) : !data || data.receivables.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-zinc-600">
              <CheckCircle2 className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">Nenhum recebível pendente</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/40">
              {receivableGroups.map((group) => (
                <PendingGroupBlock
                  key={group.key}
                  group={group}
                  variant="income"
                  updatingId={updatingId}
                  onMark={(id) => markAs(id, "RECEIVED")}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── 7. A Pagar ───────────────────────────────────────────────── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-zinc-100">A Pagar</h3>
              {!loading && data && data.payables.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-xs font-semibold">
                  {data.payables.length}
                </span>
              )}
            </div>
            {!loading && data && data.payables.length > 0 && (
              <div className="text-right">
                <p className="text-xs text-zinc-500">Total previsto</p>
                <p className="text-sm font-bold text-red-400">
                  -{formatCurrency(data.totalPayables)}
                </p>
              </div>
            )}
          </div>

          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-8 skeleton rounded-lg" />
                  <div className="h-12 skeleton rounded-lg ml-4" />
                  <div className="h-12 skeleton rounded-lg ml-4" />
                </div>
              ))}
            </div>
          ) : !data || data.payables.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-zinc-600">
              <CheckCircle2 className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">Nenhum pagamento pendente</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/40">
              {payableGroups.map((group) => (
                <PendingGroupBlock
                  key={group.key}
                  group={group}
                  variant="expense"
                  updatingId={updatingId}
                  onMark={(id) => markAs(id, "PAID")}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── 8. Extrato do Período ─────────────────────────────────────── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100">Extrato do Período</h3>
            <div className="flex items-center gap-3">
              {!loading && data && (
                <span className="text-xs text-zinc-500">
                  {data.monthTransactions.length} lançamentos
                </span>
              )}
              {!loading && data && data.monthTransactions.length > 0 && (
                <button
                  onClick={() => {
                    const sorted = [...data.monthTransactions].sort((a, b) => {
                      const dA = new Date(a.paymentDate ?? a.dueDate ?? a.competenceDate).getTime();
                      const dB = new Date(b.paymentDate ?? b.dueDate ?? b.competenceDate).getTime();
                      return dA - dB;
                    });
                    const headers = ["Vencimento", "Pagamento", "Descrição", "Categoria", "Status", "Entrada", "Saída"];
                    const rows = sorted.map((tx) => [
                      tx.dueDate ? new Date(tx.dueDate) : "",
                      tx.paymentDate ? new Date(tx.paymentDate) : "",
                      tx.description,
                      tx.category?.name ?? "",
                      tx.status,
                      tx.type === "INCOME" ? tx.amount : "",
                      tx.type === "EXPENSE" ? tx.amount : "",
                    ]);
                    const today = new Date().toISOString().slice(0, 10);
                    downloadSpreadsheet(`extrato-${today}`, headers, rows);
                  }}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
                  title="Baixar extrato em planilha (CSV)"
                >
                  <Download className="w-3.5 h-3.5" />
                  Baixar
                </button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  {([
                    { key: "date", label: "Vencimento", align: "left", hidden: false },
                    { key: "payment", label: "Pagamento", align: "left", hidden: false },
                    { key: "description", label: "Descrição", align: "left", hidden: false },
                    { key: "category", label: "Categoria", align: "left", hidden: false },
                    { key: "status", label: "Status", align: "left", hidden: true },
                    { key: "income", label: "Entrada", align: "right", hidden: false },
                    { key: "expense", label: "Saída", align: "right", hidden: false },
                    { key: "balance", label: "Saldo", align: "right", hidden: false },
                  ] as { key: SortKey; label: string; align: "left" | "right"; hidden: boolean }[]).map(
                    (col) => {
                      const active = sortBy === col.key;
                      return (
                        <th
                          key={col.key}
                          className={`px-4 py-2 text-xs text-zinc-500 select-none ${
                            col.align === "right" ? "text-right" : "text-left"
                          } ${col.hidden ? "hidden md:table-cell" : ""}`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleSort(col.key)}
                            className={`inline-flex items-center gap-1 hover:text-zinc-200 transition-colors ${
                              active ? "text-indigo-400" : ""
                            } ${col.align === "right" ? "flex-row-reverse" : ""}`}
                          >
                            <span>{col.label}</span>
                            {active &&
                              (sortDir === "asc" ? (
                                <ChevronUp className="w-3 h-3" />
                              ) : (
                                <ChevronDown className="w-3 h-3" />
                              ))}
                          </button>
                        </th>
                      );
                    }
                  )}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-zinc-800/50">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-2.5">
                          <div className="h-3 skeleton rounded" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : !data || data.monthTransactions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-zinc-600 text-sm"
                    >
                      Nenhum lançamento neste período
                    </td>
                  </tr>
                ) : (
                  (() => {
                    let runningBalance = 0;
                    const statusColors: Record<string, string> = {
                      RECEIVED: "text-emerald-400",
                      PAID: "text-zinc-400",
                      PENDING: "text-amber-400",
                      OVERDUE: "text-red-400",
                      PREDICTED: "text-indigo-400",
                    };
                    const statusLabels: Record<string, string> = {
                      RECEIVED: "Recebido",
                      PAID: "Pago",
                      PENDING: "Pendente",
                      OVERDUE: "Atrasado",
                      PREDICTED: "Previsto",
                    };
                    // Saldo + ordenação vêm memoizados (ver useMemo no topo).
                    return sortedTransactions.map((tx) => {
                      runningBalance = balanceMap.get(tx.id) ?? 0;
                      return (
                        <tr
                          key={tx.id}
                          className="border-b border-zinc-800/50 hover:bg-zinc-800/20"
                        >
                          <td className="px-4 py-2.5 text-xs text-zinc-400 whitespace-nowrap">
                            {tx.dueDate ? formatDate(tx.dueDate) : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-zinc-400 whitespace-nowrap">
                            {tx.paymentDate ? formatDate(tx.paymentDate) : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-zinc-200 text-xs max-w-[200px] truncate">
                            {tx.description}
                            {tx.isPredicted && (
                              <span className="ml-1 text-zinc-600">(previsto)</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-zinc-500">
                            {tx.category ? (
                              <span className="flex items-center gap-1.5">
                                <span
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: tx.category.color }}
                                />
                                {tx.category.name}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs hidden md:table-cell">
                            <span className={statusColors[tx.status] ?? "text-zinc-500"}>
                              {statusLabels[tx.status] ?? tx.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs text-emerald-400 font-medium">
                            {tx.type === "INCOME" ? formatCurrency(tx.amount) : ""}
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs text-red-400 font-medium">
                            {tx.type === "EXPENSE" ? formatCurrency(tx.amount) : ""}
                          </td>
                          <td
                            className={`px-4 py-2.5 text-right text-xs font-semibold ${
                              runningBalance >= 0 ? "text-zinc-300" : "text-red-400"
                            }`}
                          >
                            {formatCurrency(runningBalance)}
                          </td>
                        </tr>
                      );
                    });
                  })()
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
