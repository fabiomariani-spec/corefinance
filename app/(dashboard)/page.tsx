"use client";

import { useState, useEffect, useRef } from "react";
import { Header } from "@/components/layout/header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { formatCurrency, formatPercent, formatVariation } from "@/lib/formatters";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Landmark,
  Flame,
  Timer,
  Users,
  Pencil,
  Check,
  X,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertTriangle,
  ArrowUpCircle,
  ArrowDownCircle,
  DollarSign,
  Percent,
  Sparkles,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { Input } from "@/components/ui/input";

const CHART_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#3b82f6", "#ec4899", "#14b8a6", "#f97316", "#84cc16",
];

interface CategoryItem {
  name: string;
  amount: number;
  color: string;
}

interface DashboardData {
  currentMonth: {
    income: number;
    expenses: number;
    netProfit: number;
    netMargin: number;
    incomePredicted: number;
    expensesPredicted: number;
  };
  previousMonth: {
    income: number;
    expenses: number;
    netProfit: number;
  };
  totalCashBalance: number;
  burnRate: number;
  avgBurnRate3m: number;
  runway: number;
  headcount: number;
  revenuePerEmployee: number | null;
  prevRevenuePerEmployee: number | null;
  byDepartment: (CategoryItem & { budget: number })[];
  byIncomeCategory: CategoryItem[];
  churn: {
    customerChurnRate: number;
    revenueChurnRate: number;
    churnedClients: number;
    prevClientCount: number;
  };
  monthlyTrend: {
    month: string;
    income: number;
    expenses: number;
    profit: number;
    cashFlow: number;
  }[];
  churnTrend12m: {
    month: string;
    customerChurnRate: number;
    revenueChurnRate: number;
  }[];
}

function TooltipBRL({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-3 shadow-xl text-xs">
      <p className="text-zinc-400 mb-2 font-medium">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-zinc-300">{p.name}:</span>
          <span className="text-zinc-100 font-semibold">{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function TooltipPct({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-3 shadow-xl text-xs">
      <p className="text-zinc-400 mb-2 font-medium">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-zinc-300">{p.name}:</span>
          <span className="text-zinc-100 font-semibold">{formatPercent(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Simple inline Markdown renderer ──────────────────────────────────────────
function SimpleMarkdown({ text, streaming }: { text: string; streaming?: boolean }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("## ")) {
      elements.push(
        <h4 key={i} className="text-sm font-bold text-zinc-100 mt-4 mb-1.5 first:mt-0 flex items-center gap-1.5">
          {line.slice(3)}
        </h4>
      );
    } else if (line.startsWith("- ") || line.startsWith("• ")) {
      elements.push(
        <div key={i} className="flex items-start gap-2 pl-1">
          <span className="text-indigo-400 mt-0.5 shrink-0 text-xs">▸</span>
          <span className="text-sm text-zinc-300 leading-relaxed">{line.slice(2)}</span>
        </div>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-1" />);
    } else {
      elements.push(
        <p key={i} className="text-sm text-zinc-300 leading-relaxed">
          {line}
        </p>
      );
    }
  }

  return (
    <div className="space-y-0.5">
      {elements}
      {streaming && (
        <span className="inline-block w-0.5 h-4 bg-indigo-400 animate-pulse ml-0.5 align-middle" />
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<"month" | "quarter" | "year">("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingHeadcount, setEditingHeadcount] = useState(false);
  const [headcountInput, setHeadcountInput] = useState("");
  const headcountRef = useRef<HTMLInputElement>(null);

  // AI Insight state
  const [insightOpen, setInsightOpen] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightText, setInsightText] = useState("");
  const insightRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, period]);

  useEffect(() => {
    if (editingHeadcount) headcountRef.current?.focus();
  }, [editingHeadcount]);

  async function fetchDashboard() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/dashboard?date=${currentDate.toISOString()}&period=${period}`
      );
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setHeadcountInput(String(json.headcount ?? 0));
      }
    } finally {
      setLoading(false);
    }
  }

  async function saveHeadcount() {
    const n = parseInt(headcountInput);
    if (isNaN(n) || n < 0) return;
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ headcount: n }),
    });
    setEditingHeadcount(false);
    fetchDashboard();
  }

  // ── AI Insight ─────────────────────────────────────────────────────────────
  async function handleAiInsight(force = false) {
    if (!data) return;
    // If already has text and not forcing regen, just toggle
    if (insightText && !force) {
      setInsightOpen((o) => !o);
      return;
    }
    // Abort any in-progress stream
    insightRef.current?.abort();
    const ctrl = new AbortController();
    insightRef.current = ctrl;

    setInsightOpen(true);
    setInsightLoading(true);
    setInsightText("");

    try {
      const res = await fetch("/api/ai-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, period }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        setInsightText("Erro ao gerar análise. Verifique a configuração da API.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setInsightText((prev) => prev + chunk);
      }
    } catch (err: unknown) {
      if ((err as { name?: string }).name !== "AbortError") {
        setInsightText("Erro ao conectar com a IA. Verifique sua conexão e tente novamente.");
      }
    } finally {
      setInsightLoading(false);
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const isBurning = (data?.burnRate ?? 0) > 0;
  const runwayVal = data?.runway === -1 ? null : (data?.runway ?? null);
  const runwayColor: "emerald" | "amber" | "red" =
    runwayVal === null ? "emerald" : runwayVal > 18 ? "emerald" : runwayVal > 9 ? "amber" : "red";
  const runwayLabel = runwayVal === null ? "∞ meses" : `${runwayVal.toFixed(1)} meses`;
  const runwayBarPct = runwayVal === null ? 100 : Math.min((runwayVal / 24) * 100, 100);

  const currentIncome = data?.currentMonth.income ?? 0;
  const totalIncomeCategory = (data?.byIncomeCategory ?? []).reduce((s, c) => s + c.amount, 0);
  const maxDeptAmount = (data?.byDepartment[0]?.amount ?? 1) || 1;

  const periodLabel =
    period === "month" ? "mês anterior" : period === "quarter" ? "trim. anterior" : "ano anterior";

  const revPerEmpVar =
    data?.revenuePerEmployee != null && data?.prevRevenuePerEmployee != null && data.prevRevenuePerEmployee > 0
      ? ((data.revenuePerEmployee - data.prevRevenuePerEmployee) / data.prevRevenuePerEmployee) * 100
      : null;

  function churnTextColor(rate: number) {
    if (rate < 2) return "text-emerald-400";
    if (rate < 5) return "text-amber-400";
    return "text-red-400";
  }
  function churnCardBg(rate: number) {
    if (rate < 2) return "bg-emerald-600/10 border-emerald-600/20";
    if (rate < 5) return "bg-amber-600/10 border-amber-600/20";
    return "bg-red-600/10 border-red-600/20";
  }

  function monthLabel(iso: string, fmt = "MMM") {
    try { return format(new Date(iso), fmt, { locale: ptBR }); }
    catch { return ""; }
  }

  return (
    <>
      <Header
        title="Painel Executivo"
        subtitle="Visão financeira estratégica"
        showDateNav
        currentDate={currentDate}
        onDateChange={setCurrentDate}
      />

      <div className="flex-1 p-6 space-y-5 overflow-auto">

        {/* ── Period Selector + AI Insight Button ── */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-1 bg-zinc-800 border border-zinc-700 rounded-lg p-1">
            {(["month", "quarter", "year"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  period === p ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {p === "month" ? "Mês" : p === "quarter" ? "Trimestre" : "Ano"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {/* AI Insight button */}
            <button
              onClick={() => handleAiInsight()}
              disabled={!data || loading}
              title="Análise de IA — visão de CFO"
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                transition-all border
                ${insightOpen
                  ? "bg-indigo-600/20 border-indigo-500/60 text-indigo-300"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-indigo-500/40 hover:text-indigo-300 hover:bg-indigo-950/30"
                }
                disabled:opacity-40 disabled:cursor-not-allowed
              `}
            >
              <Sparkles className={`w-3.5 h-3.5 ${insightLoading ? "animate-pulse" : ""}`} />
              {insightLoading ? "Analisando..." : "Insight IA"}
            </button>

            <button
              onClick={fetchDashboard}
              title="Atualizar"
              className={`text-zinc-500 hover:text-zinc-300 transition-colors ${loading ? "animate-spin" : ""}`}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── AI Insight Panel ── */}
        {insightOpen && (
          <div className="bg-gradient-to-br from-indigo-950/60 to-violet-950/50 border border-indigo-500/30 rounded-xl overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-indigo-500/20">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-indigo-600/30 flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <span className="text-sm font-semibold text-indigo-200">CFO Virtual — Análise IA</span>
                {insightLoading && (
                  <div className="flex items-center gap-1 text-xs text-indigo-400/70">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    gerando...
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                {/* Re-generate */}
                {!insightLoading && insightText && (
                  <button
                    onClick={() => handleAiInsight(true)}
                    title="Regenerar análise"
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-indigo-400/70 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Re-gerar
                  </button>
                )}
                {/* Close */}
                <button
                  onClick={() => { setInsightOpen(false); insightRef.current?.abort(); }}
                  className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 transition-colors"
                  title="Fechar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Panel content */}
            <div className="px-5 py-4">
              {insightLoading && !insightText ? (
                <div className="flex items-center gap-3 text-sm text-indigo-300/60 py-4">
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>Analisando {data?.currentMonth.income ? "dados financeiros" : "painel"}... isso pode levar alguns segundos.</span>
                </div>
              ) : (
                <SimpleMarkdown text={insightText} streaming={insightLoading} />
              )}
            </div>

            {/* Footer disclaimer */}
            {!insightLoading && insightText && (
              <div className="px-5 pb-3 border-t border-indigo-500/10 pt-2.5">
                <p className="text-xs text-zinc-600">
                  ✦ Análise gerada por IA com base nos dados do painel. Sempre valide com seu time financeiro.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            RESULTADO FINANCEIRO — Receita / Despesas / Lucro / Margem
        ═══════════════════════════════════════════════ */}
        <div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Resultado Financeiro</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Receita */}
          <KpiCard
            title="Receita"
            value={loading ? "..." : formatCurrency(data?.currentMonth.income ?? 0)}
            subtitle={loading ? "" : `Previsto: ${formatCurrency((data?.currentMonth.incomePredicted ?? 0) + (data?.currentMonth.income ?? 0))}`}
            variation={
              !loading && data
                ? formatVariation(data.currentMonth.income, data.previousMonth.income)
                : undefined
            }
            icon={<ArrowUpCircle className="w-4 h-4" />}
            color="emerald"
          />

          {/* Despesas */}
          <KpiCard
            title="Despesas"
            value={loading ? "..." : formatCurrency(data?.currentMonth.expenses ?? 0)}
            subtitle={loading ? "" : `Previsto: ${formatCurrency((data?.currentMonth.expensesPredicted ?? 0) + (data?.currentMonth.expenses ?? 0))}`}
            variation={
              !loading && data
                ? (() => {
                    const v = formatVariation(data.currentMonth.expenses, data.previousMonth.expenses);
                    return { ...v, isPositive: !v.isPositive }; // despesas maiores = negativo
                  })()
                : undefined
            }
            icon={<ArrowDownCircle className="w-4 h-4" />}
            color="red"
          />

          {/* Lucro Líquido */}
          <KpiCard
            title="Lucro Líquido"
            value={loading ? "..." : formatCurrency(data?.currentMonth.netProfit ?? 0)}
            subtitle={loading ? "" : `vs anterior: ${formatCurrency(data?.previousMonth.netProfit ?? 0)}`}
            variation={
              !loading && data
                ? formatVariation(data.currentMonth.netProfit, data.previousMonth.netProfit)
                : undefined
            }
            icon={<DollarSign className="w-4 h-4" />}
            color={(data?.currentMonth.netProfit ?? 0) >= 0 ? "emerald" : "red"}
          />

          {/* Margem Líquida */}
          <KpiCard
            title="Margem Líquida"
            value={loading ? "..." : `${(data?.currentMonth.netMargin ?? 0).toFixed(1)}%`}
            subtitle={loading ? "" : (data?.currentMonth.netMargin ?? 0) >= 20
              ? "Excelente margem"
              : (data?.currentMonth.netMargin ?? 0) >= 0
              ? "Margem positiva"
              : "Margem negativa"}
            icon={<Percent className="w-4 h-4" />}
            color={
              (data?.currentMonth.netMargin ?? 0) >= 20 ? "emerald"
              : (data?.currentMonth.netMargin ?? 0) >= 0 ? "amber"
              : "red"
            }
          />
        </div>

        </div>
        </div>

        {/* ═══════════════════════════════════════════════
            LINHA 1 — Cards principais
        ═══════════════════════════════════════════════ */}
        <div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Indicadores Operacionais</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Caixa Atual */}
          <KpiCard
            title="Caixa Atual"
            value={loading ? "..." : formatCurrency(data?.totalCashBalance ?? 0)}
            subtitle="Saldo total em contas"
            icon={<Landmark className="w-4 h-4" />}
            color="indigo"
          />

          {/* Burn Rate */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-3 hover:border-zinc-700 transition-colors">
            <div className="flex items-start justify-between">
              <p className="text-sm font-medium text-zinc-400">Burn Rate</p>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isBurning ? "bg-amber-600/15 text-amber-400" : "bg-emerald-600/15 text-emerald-400"
              }`}>
                <Flame className="w-4 h-4" />
              </div>
            </div>
            <div>
              {loading ? (
                <div className="h-8 skeleton rounded w-28" />
              ) : isBurning ? (
                <p className="text-2xl font-bold text-zinc-100">
                  {formatCurrency(data?.burnRate ?? 0)}
                </p>
              ) : (
                <p className="text-xl font-bold text-emerald-400">Saldo Positivo</p>
              )}
              <p className="text-xs text-zinc-500 mt-0.5">
                Média 3m: {loading ? "..." : formatCurrency(data?.avgBurnRate3m ?? 0)}
              </p>
            </div>
            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium w-fit ${
              isBurning ? "bg-amber-600/10 text-amber-400" : "bg-emerald-600/10 text-emerald-400"
            }`}>
              {isBurning
                ? <><TrendingDown className="w-3 h-3" /> Queima de caixa</>
                : <><TrendingUp className="w-3 h-3" /> Receita supera despesas</>
              }
            </div>
          </div>

          {/* Runway */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-3 hover:border-zinc-700 transition-colors">
            <div className="flex items-start justify-between">
              <p className="text-sm font-medium text-zinc-400">Runway</p>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                runwayColor === "emerald" ? "bg-emerald-600/15 text-emerald-400"
                : runwayColor === "amber" ? "bg-amber-600/15 text-amber-400"
                : "bg-red-600/15 text-red-400"
              }`}>
                <Timer className="w-4 h-4" />
              </div>
            </div>
            <div>
              {loading ? (
                <div className="h-8 skeleton rounded w-24" />
              ) : (
                <p className={`text-2xl font-bold ${
                  runwayColor === "emerald" ? "text-emerald-400"
                  : runwayColor === "amber" ? "text-amber-400"
                  : "text-red-400"
                }`}>
                  {runwayLabel}
                </p>
              )}
              <p className="text-xs text-zinc-500 mt-0.5">Meses de operação restantes</p>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  runwayColor === "emerald" ? "bg-emerald-500"
                  : runwayColor === "amber" ? "bg-amber-500"
                  : "bg-red-500"
                }`}
                style={{ width: `${loading ? 0 : runwayBarPct}%` }}
              />
            </div>
            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium w-fit ${
              runwayColor === "emerald" ? "bg-emerald-600/10 text-emerald-400"
              : runwayColor === "amber" ? "bg-amber-600/10 text-amber-400"
              : "bg-red-600/10 text-red-400"
            }`}>
              {runwayColor === "red" && <AlertTriangle className="w-3 h-3" />}
              {runwayColor === "emerald"
                ? runwayVal === null ? "Sem queima de caixa" : "Saúde excelente"
                : runwayColor === "amber" ? "Atenção necessária"
                : "Risco crítico de caixa"}
            </div>
          </div>

          {/* Revenue per Employee */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-3 hover:border-zinc-700 transition-colors">
            <div className="flex items-start justify-between">
              <p className="text-sm font-medium text-zinc-400">Receita / Funcionário</p>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-violet-600/15 text-violet-400">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div>
              {loading ? (
                <div className="h-8 skeleton rounded w-28" />
              ) : data?.revenuePerEmployee != null ? (
                <p className="text-2xl font-bold text-zinc-100">
                  {formatCurrency(data.revenuePerEmployee)}
                </p>
              ) : (
                <p className="text-sm text-zinc-500">Configure o headcount →</p>
              )}
              {/* Inline edit */}
              {!editingHeadcount ? (
                <button
                  onClick={() => { setEditingHeadcount(true); setHeadcountInput(String(data?.headcount ?? 0)); }}
                  className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 mt-1 transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                  {data?.headcount ? `${data.headcount} funcionários` : "Definir headcount"}
                </button>
              ) : (
                <div className="flex items-center gap-1 mt-1">
                  <Input
                    ref={headcountRef}
                    type="number"
                    min={0}
                    value={headcountInput}
                    onChange={(e) => setHeadcountInput(e.target.value)}
                    className="h-6 w-16 text-xs px-1.5"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveHeadcount();
                      if (e.key === "Escape") setEditingHeadcount(false);
                    }}
                  />
                  <span className="text-xs text-zinc-500">func.</span>
                  <button onClick={saveHeadcount} className="text-emerald-400 hover:text-emerald-300 p-0.5">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setEditingHeadcount(false)} className="text-zinc-500 hover:text-zinc-300 p-0.5">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
            {revPerEmpVar !== null && (
              <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium w-fit ${
                revPerEmpVar >= 0 ? "bg-emerald-600/10 text-emerald-400" : "bg-red-600/10 text-red-400"
              }`}>
                {revPerEmpVar >= 0
                  ? <><TrendingUp className="w-3 h-3" />+{revPerEmpVar.toFixed(1)}%</>
                  : <><TrendingDown className="w-3 h-3" />{revPerEmpVar.toFixed(1)}%</>
                }
                <span> vs {periodLabel}</span>
              </div>
            )}
          </div>
        </div>
        </div>

        {/* ═══════════════════════════════════════════════
            LINHA 2 — Receita por Produto | Despesas por Área
        ═══════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Receita por Produto / Categoria */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              Receita por Produto / Categoria
            </h3>
            {loading ? (
              <div className="h-52 skeleton rounded-lg" />
            ) : (data?.byIncomeCategory ?? []).length === 0 ? (
              <p className="text-sm text-zinc-600 text-center py-14">
                Nenhuma receita categorizada no período
              </p>
            ) : (
              <div className="flex gap-4 items-start">
                {/* Donut */}
                <div className="shrink-0">
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie
                        data={data!.byIncomeCategory}
                        dataKey="amount"
                        nameKey="name"
                        innerRadius={42}
                        outerRadius={65}
                        paddingAngle={3}
                        startAngle={90}
                        endAngle={-270}
                      >
                        {data!.byIncomeCategory.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={entry.color || CHART_COLORS[i % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) =>
                          active && payload?.length ? (
                            <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs shadow-xl">
                              <p className="text-zinc-100 font-medium">{payload[0].name}</p>
                              <p className="text-zinc-300">{formatCurrency(Number(payload[0].value))}</p>
                              <p className="text-zinc-500">
                                {totalIncomeCategory > 0
                                  ? formatPercent((Number(payload[0].value) / totalIncomeCategory) * 100)
                                  : "0%"}
                              </p>
                            </div>
                          ) : null
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Ranking */}
                <div className="flex-1 space-y-2.5 overflow-auto max-h-[160px] pr-1">
                  {data!.byIncomeCategory.map((item, i) => {
                    const pct = totalIncomeCategory > 0 ? (item.amount / totalIncomeCategory) * 100 : 0;
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-zinc-600 w-4 shrink-0 text-right">#{i + 1}</span>
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: item.color || CHART_COLORS[i % CHART_COLORS.length] }}
                        />
                        <span className="text-xs text-zinc-300 flex-1 truncate">{item.name}</span>
                        <span className="text-xs font-semibold text-zinc-100 shrink-0">
                          {formatCurrency(item.amount)}
                        </span>
                        <span className="text-xs text-zinc-500 w-10 text-right shrink-0">
                          {formatPercent(pct)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Despesas por Área */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                Despesas por Área
              </h3>
              <span className="text-xs text-zinc-500">
                {(data?.byDepartment ?? []).some((d) => d.budget > 0)
                  ? "real vs budget"
                  : currentIncome > 0 ? "% da receita" : ""}
              </span>
            </div>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-7 skeleton rounded" />
                ))}
              </div>
            ) : (data?.byDepartment ?? []).length === 0 ? (
              <p className="text-sm text-zinc-600 text-center py-14">
                Nenhuma despesa por departamento no período
              </p>
            ) : (
              <div className="space-y-3">
                {data!.byDepartment.map((dept, i) => {
                  const hasBudget = dept.budget > 0;
                  const utilPct = hasBudget ? (dept.amount / dept.budget) * 100 : 0;
                  const barPct = hasBudget
                    ? Math.min(utilPct, 100)
                    : (dept.amount / maxDeptAmount) * 100;
                  const pctOfRevenue = currentIncome > 0 ? (dept.amount / currentIncome) * 100 : 0;

                  // Color: green < 80%, amber 80–100%, red > 100% (budget exceeded)
                  const barColor = hasBudget
                    ? utilPct < 80 ? "#10b981"
                    : utilPct <= 100 ? "#f59e0b"
                    : "#ef4444"
                    : dept.color || CHART_COLORS[i % CHART_COLORS.length];

                  const utilLabel = hasBudget
                    ? utilPct < 80 ? "text-emerald-400"
                    : utilPct <= 100 ? "text-amber-400"
                    : "text-red-400 font-bold"
                    : "text-zinc-500";

                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-400 w-[80px] truncate shrink-0">{dept.name}</span>
                        {/* Bar track */}
                        <div className="flex-1 relative bg-zinc-800 rounded-full h-2 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${barPct}%`, backgroundColor: barColor }}
                          />
                          {/* Overflow flash if exceeding budget */}
                          {hasBudget && utilPct > 100 && (
                            <div className="absolute inset-0 bg-red-500/20 rounded-full animate-pulse" />
                          )}
                        </div>
                        {/* Amount(s) */}
                        <div className="shrink-0 text-right min-w-[72px]">
                          <p className="text-xs font-semibold text-zinc-200 leading-none">
                            {formatCurrency(dept.amount)}
                          </p>
                          {hasBudget && (
                            <p className="text-xs text-zinc-600 leading-none mt-0.5">
                              / {formatCurrency(dept.budget)}
                            </p>
                          )}
                        </div>
                        {/* Right badge */}
                        <span className={`text-xs shrink-0 w-10 text-right ${utilLabel}`}>
                          {hasBudget
                            ? `${utilPct.toFixed(0)}%`
                            : currentIncome > 0 ? formatPercent(pctOfRevenue) : ""}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Legend */}
            {!loading && (data?.byDepartment ?? []).some((d) => d.budget > 0) && (
              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-zinc-800">
                <span className="text-xs text-zinc-600">Utilização:</span>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs text-zinc-500">&lt;80%</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-xs text-zinc-500">80–100%</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-xs text-zinc-500">&gt;100%</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════
            LINHA 3 — Métricas de Churn | Fluxo de Caixa 12m
        ═══════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Métricas de Churn */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-violet-400" />
              Métricas de Churn
            </h3>
            {loading ? (
              <div className="h-56 skeleton rounded-lg" />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className={`border rounded-xl p-3 ${churnCardBg(data?.churn.customerChurnRate ?? 0)}`}>
                    <p className="text-xs text-zinc-400 mb-1">Churn de Clientes</p>
                    <p className={`text-xl font-bold ${churnTextColor(data?.churn.customerChurnRate ?? 0)}`}>
                      {formatPercent(data?.churn.customerChurnRate ?? 0)}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {data?.churn.churnedClients ?? 0} de {data?.churn.prevClientCount ?? 0} clientes
                    </p>
                  </div>
                  <div className={`border rounded-xl p-3 ${churnCardBg(data?.churn.revenueChurnRate ?? 0)}`}>
                    <p className="text-xs text-zinc-400 mb-1">Churn de Receita</p>
                    <p className={`text-xl font-bold ${churnTextColor(data?.churn.revenueChurnRate ?? 0)}`}>
                      {formatPercent(data?.churn.revenueChurnRate ?? 0)}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">Receita perdida no período</p>
                  </div>
                </div>

                <ResponsiveContainer width="100%" height={130}>
                  <LineChart
                    data={(data?.churnTrend12m ?? []).map((m) => ({
                      ...m,
                      label: monthLabel(m.month),
                    }))}
                    margin={{ top: 5, right: 5, bottom: 0, left: -20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#71717a", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#71717a", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
                    />
                    <Tooltip content={<TooltipPct />} />
                    <Legend wrapperStyle={{ fontSize: 10, color: "#a1a1aa" }} />
                    <Line
                      type="monotone"
                      dataKey="customerChurnRate"
                      name="Clientes"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="revenueChurnRate"
                      name="Receita"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>

                <p className="text-xs text-zinc-600 mt-2 text-center">
                  * Baseado em contatos vinculados a lançamentos de receita
                </p>
              </>
            )}
          </div>

          {/* Fluxo de Caixa — 12 meses */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-400" />
              Fluxo de Caixa — 12 meses
            </h3>
            {loading ? (
              <div className="h-56 skeleton rounded-lg" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart
                  data={(data?.monthlyTrend ?? []).map((m) => ({
                    ...m,
                    label: monthLabel(m.month, "MMM/yy"),
                  }))}
                  margin={{ top: 5, right: 5, bottom: 0, left: -10 }}
                >
                  <defs>
                    <linearGradient id="gIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gExpenses" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#71717a", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#71717a", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => {
                      if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
                      if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
                      return String(v);
                    }}
                  />
                  <Tooltip content={<TooltipBRL />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} />
                  <Area
                    type="monotone"
                    dataKey="income"
                    name="Receita"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#gIncome)"
                  />
                  <Area
                    type="monotone"
                    dataKey="expenses"
                    name="Despesas"
                    stroke="#ef4444"
                    strokeWidth={2}
                    fill="url(#gExpenses)"
                  />
                  <Area
                    type="monotone"
                    dataKey="profit"
                    name="Resultado"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="none"
                    strokeDasharray="4 2"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

      </div>
    </>
  );
}
