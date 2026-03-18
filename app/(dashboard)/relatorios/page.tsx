"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import {
  BarChart3,
  Download,
  FileText,
  TrendingUp,
  TrendingDown,
  Loader2,
  Calendar,
  Building2,
  User,
  Tag,
  Wallet,
  Flame,
  AlertTriangle,
  ShoppingBag,
  Star,
  Users,
} from "lucide-react";
import { startOfMonth, endOfMonth, format, subMonths, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

// ── Interfaces ────────────────────────────────────────────────────────────────

interface DreReport {
  period: { start: string; end: string };
  income: number;
  expenses: number;
  netProfit: number;
  netMargin: number;
  expensesByCategory: { name: string; amount: number; percentage: number }[];
}

interface RevenueProductItem {
  name: string;
  color: string;
  amount: number;
  count: number;
  pctOfRevenue: number;
  avgTicket: number;
}

interface RevenueCustomerItem {
  name: string;
  amount: number;
  count: number;
  pctOfRevenue: number;
  avgTicket: number;
}

interface RevenueReport {
  period: { start: string; end: string };
  summary: {
    totalIncome: number;
    transactionCount: number;
    avgPerDay: number;
    avgPerWeek: number;
    avgTicket: number;
    dayCount: number;
    weekCount: number;
  };
  byProduct: RevenueProductItem[];
  byCustomer: RevenueCustomerItem[];
  byWeek: { label: string; amount: number; count: number }[];
  topWeek: { label: string; amount: number; count: number } | null;
  byDayOfWeek: { day: string; dayIndex: number; amount: number; count: number }[];
  bestDayOfWeek: { day: string; amount: number } | null;
  byPeriodOfMonth: { label: string; amount: number; count: number }[];
}

interface DetailedCategoryItem {
  name: string;
  color: string;
  amount: number;
  count: number;
  pctOfExpenses: number;
  pctOfIncome: number;
}

interface DetailedDeptItem {
  name: string;
  color: string;
  amount: number;
  count: number;
  pctOfExpenses: number;
  budget: number;
  budgetUtilPct: number;
}

interface DetailedContactItem {
  name: string;
  amount: number;
  count: number;
  pctOfExpenses: number;
}

interface DetailedReport {
  period: { start: string; end: string };
  summary: {
    totalIncome: number;
    totalExpenses: number;
    netProfit: number;
    netMargin: number;
    expenseCount: number;
    avgExpensePerDay: number;
  };
  byCategory: DetailedCategoryItem[];
  byDepartment: DetailedDeptItem[];
  byWeek: { label: string; amount: number; count: number }[];
  topWeek: { label: string; amount: number; count: number } | null;
  topDepartment: DetailedDeptItem | null;
  byContact: DetailedContactItem[];
  topContact: DetailedContactItem | null;
  payroll: {
    total: number;
    pctOfExpenses: number;
    byDepartment: { name: string; amount: number; pctOfPayroll: number }[];
  };
}

// ── Tooltip Components ────────────────────────────────────────────────────────

function WeekTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs">
      <p className="text-zinc-400 mb-1">{label}</p>
      <p className="font-bold text-red-400">{formatCurrency(payload[0].value)}</p>
    </div>
  );
}

function RevenueTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs">
      <p className="text-zinc-400 mb-1">{label}</p>
      <p className="font-bold text-emerald-400">{formatCurrency(payload[0].value)}</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RelatoriosPage() {
  const [reportType, setReportType] = useState("dre");
  const [startDate, setStartDate] = useState(
    startOfMonth(new Date()).toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState(
    endOfMonth(new Date()).toISOString().split("T")[0]
  );
  const [loading, setLoading] = useState(false);
  const [dreData, setDreData] = useState<DreReport | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueReport | null>(null);
  const [detailedData, setDetailedData] = useState<DetailedReport | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setDreData(null);
    setRevenueData(null);
    setDetailedData(null);

    try {
      const res = await fetch(
        `/api/reports?type=${reportType}&startDate=${startDate}&endDate=${endDate}`
      );
      const data = await res.json();

      if (reportType === "dre") setDreData(data);
      else if (reportType === "revenue") setRevenueData(data);
      else if (reportType === "detailed-expenses") setDetailedData(data);
    } finally {
      setLoading(false);
    }
  }

  // ── CSV: DRE ───────────────────────────────────────────────────────────────
  function handleExportDRECSV() {
    if (!dreData) return;
    const rows = [
      ["DRE Gerencial", "", ""],
      ["Período", dreData.period.start.slice(0, 10), dreData.period.end.slice(0, 10)],
      ["", "", ""],
      ["Receita Bruta", formatCurrency(dreData.income), ""],
      ["Total Despesas", formatCurrency(dreData.expenses), ""],
      ["Lucro Líquido", formatCurrency(dreData.netProfit), ""],
      ["Margem Líquida", formatPercent(dreData.netMargin), ""],
      ["", "", ""],
      ["Categoria", "Valor", "% Receita"],
      ...dreData.expensesByCategory.map((c) => [
        c.name,
        formatCurrency(c.amount),
        formatPercent(c.percentage),
      ]),
    ];
    downloadCSV(rows, `dre-${startDate}-${endDate}.csv`);
  }

  // ── CSV: Receita ───────────────────────────────────────────────────────────
  function handleExportRevenueCSV() {
    if (!revenueData) return;
    const d = revenueData;
    const rows: string[][] = [
      ["ANÁLISE DE RECEITA"],
      ["Período", d.period.start.slice(0, 10), "a", d.period.end.slice(0, 10)],
      [],
      ["=== RESUMO ==="],
      ["Receita Total", formatCurrency(d.summary.totalIncome)],
      ["Nº de Lançamentos", String(d.summary.transactionCount)],
      ["Ticket Médio", formatCurrency(d.summary.avgTicket)],
      ["Média por Dia", formatCurrency(d.summary.avgPerDay)],
      ["Média por Semana", formatCurrency(d.summary.avgPerWeek)],
      [],
      ["=== RANKING DE PRODUTOS / CATEGORIAS ==="],
      ["#", "Produto", "Receita", "% do Total", "Qtd", "Ticket Médio"],
      ...d.byProduct.map((p, i) => [
        String(i + 1),
        p.name,
        formatCurrency(p.amount),
        formatPercent(p.pctOfRevenue),
        String(p.count),
        formatCurrency(p.avgTicket),
      ]),
      [],
      ["=== RANKING DE CLIENTES ==="],
      ["#", "Cliente", "Receita", "% do Total", "Qtd", "Ticket Médio"],
      ...d.byCustomer.map((c, i) => [
        String(i + 1),
        c.name,
        formatCurrency(c.amount),
        formatPercent(c.pctOfRevenue),
        String(c.count),
        formatCurrency(c.avgTicket),
      ]),
      [],
      ["=== DISTRIBUIÇÃO SEMANAL ==="],
      ["Semana", "Receita", "Qtd"],
      ...d.byWeek.map((w) => [w.label, formatCurrency(w.amount), String(w.count)]),
      [],
      ["=== POR DIA DA SEMANA ==="],
      ["Dia", "Receita", "Qtd"],
      ...d.byDayOfWeek.map((dw) => [dw.day, formatCurrency(dw.amount), String(dw.count)]),
      [],
      ["=== POR PERÍODO DO MÊS ==="],
      ["Período", "Receita", "Qtd"],
      ...d.byPeriodOfMonth.map((p) => [p.label, formatCurrency(p.amount), String(p.count)]),
    ];
    downloadCSV(rows, `receita-${startDate}-${endDate}.csv`);
  }

  // ── CSV: Análise Detalhada ─────────────────────────────────────────────────
  function handleExportDetailedCSV() {
    if (!detailedData) return;
    const d = detailedData;
    const rows: string[][] = [
      ["ANÁLISE DETALHADA DE DESPESAS"],
      ["Período", d.period.start.slice(0, 10), "a", d.period.end.slice(0, 10)],
      [],
      ["=== RESUMO ==="],
      ["Total Despesas", formatCurrency(d.summary.totalExpenses)],
      ["Total Receitas", formatCurrency(d.summary.totalIncome)],
      ["Resultado", formatCurrency(d.summary.netProfit)],
      ["Margem", formatPercent(d.summary.netMargin)],
      ["Nº Lançamentos", String(d.summary.expenseCount)],
      ["Média por Dia", formatCurrency(d.summary.avgExpensePerDay)],
      [],
      ["=== DESPESAS POR CATEGORIA ==="],
      ["#", "Categoria", "Valor", "% Despesas", "% Receita", "Qtd"],
      ...d.byCategory.map((c, i) => [
        String(i + 1),
        c.name,
        formatCurrency(c.amount),
        formatPercent(c.pctOfExpenses),
        formatPercent(c.pctOfIncome),
        String(c.count),
      ]),
      [],
      ["=== DESPESAS POR DEPARTAMENTO ==="],
      ["#", "Departamento", "Valor", "% Despesas", "Budget", "% Budget", "Qtd"],
      ...d.byDepartment.map((dept, i) => [
        String(i + 1),
        dept.name,
        formatCurrency(dept.amount),
        formatPercent(dept.pctOfExpenses),
        dept.budget > 0 ? formatCurrency(dept.budget) : "—",
        dept.budget > 0 ? formatPercent(dept.budgetUtilPct) : "—",
        String(dept.count),
      ]),
      [],
      ["=== DISTRIBUIÇÃO SEMANAL ==="],
      ["Semana", "Valor", "Qtd Lançamentos"],
      ...d.byWeek.map((w) => [w.label, formatCurrency(w.amount), String(w.count)]),
      [],
    ];

    if (d.byContact.length > 0) {
      rows.push(
        ["=== TOP CONTATOS / RESPONSÁVEIS ==="],
        ["#", "Nome", "Valor", "% Despesas", "Qtd"],
        ...d.byContact.map((c, i) => [
          String(i + 1),
          c.name,
          formatCurrency(c.amount),
          formatPercent(c.pctOfExpenses),
          String(c.count),
        ]),
        []
      );
    }

    if (d.payroll.total > 0) {
      rows.push(
        ["=== FOLHA DE PAGAMENTO ==="],
        ["Total Folha", formatCurrency(d.payroll.total)],
        ["% das Despesas", formatPercent(d.payroll.pctOfExpenses)],
        [],
        ["Departamento", "Valor", "% da Folha"],
        ...d.payroll.byDepartment.map((p) => [
          p.name,
          formatCurrency(p.amount),
          formatPercent(p.pctOfPayroll),
        ])
      );
    }

    downloadCSV(rows, `despesas-detalhadas-${startDate}-${endDate}.csv`);
  }

  function downloadCSV(rows: string[][], filename: string) {
    const csv = rows.map((r) => r.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const months = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), i);
    return {
      label: format(d, "MMMM yyyy", { locale: ptBR }),
      start: startOfMonth(d),
      end: endOfMonth(d),
    };
  });

  const hasData = dreData || revenueData || detailedData;

  function periodLabel(p: { start: string; end: string }) {
    return `${format(parseISO(p.start), "dd/MM/yyyy")} – ${format(parseISO(p.end), "dd/MM/yyyy")}`;
  }

  return (
    <>
      <Header title="Relatórios" subtitle="Análise financeira e exportações" />
      <div className="flex-1 p-6 space-y-5">

        {/* ── Filter Panel ────────────────────────────────────────────────── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-100">Configurar Relatório</h3>
          <div className="flex items-end gap-4 flex-wrap">
            <div className="space-y-1.5 min-w-[220px]">
              <Label>Tipo de Relatório</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dre">DRE Gerencial</SelectItem>
                  <SelectItem value="revenue">Análise de Receita</SelectItem>
                  <SelectItem value="detailed-expenses">Análise Detalhada de Despesas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data Início</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data Fim</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleGenerate} disabled={loading}>
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</>
                ) : (
                  <><BarChart3 className="w-4 h-4" /> Gerar</>
                )}
              </Button>
              <Select
                onValueChange={(v) => {
                  const idx = parseInt(v);
                  setStartDate(months[idx].start.toISOString().split("T")[0]);
                  setEndDate(months[idx].end.toISOString().split("T")[0]);
                }}
              >
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Mês rápido..." />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m, i) => (
                    <SelectItem key={i} value={String(i)} className="capitalize">
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* ── DRE Report ──────────────────────────────────────────────────── */}
        {dreData && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-zinc-100">DRE Gerencial</h3>
                <p className="text-xs text-zinc-500 mt-0.5">{periodLabel(dreData.period)}</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleExportDRECSV}>
                <Download className="w-4 h-4" /> Exportar CSV
              </Button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-zinc-500">Receita Bruta</span>
                </div>
                <p className="text-xl font-bold text-emerald-400">{formatCurrency(dreData.income)}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="w-4 h-4 text-red-400" />
                  <span className="text-xs text-zinc-500">Total Despesas</span>
                </div>
                <p className="text-xl font-bold text-red-400">{formatCurrency(dreData.expenses)}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs text-zinc-500">Lucro Líquido</span>
                </div>
                <p className={`text-xl font-bold ${dreData.netProfit >= 0 ? "text-indigo-400" : "text-red-400"}`}>
                  {formatCurrency(dreData.netProfit)}
                </p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="w-4 h-4 text-violet-400" />
                  <span className="text-xs text-zinc-500">Margem Líquida</span>
                </div>
                <p className={`text-xl font-bold ${dreData.netMargin >= 20 ? "text-emerald-400" : dreData.netMargin >= 0 ? "text-violet-400" : "text-red-400"}`}>
                  {formatPercent(dreData.netMargin)}
                </p>
              </div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800">
                <h4 className="text-sm font-semibold text-zinc-100">Despesas por Categoria</h4>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-4 py-2 text-xs text-zinc-500">Categoria</th>
                    <th className="text-right px-4 py-2 text-xs text-zinc-500">Valor</th>
                    <th className="text-right px-4 py-2 text-xs text-zinc-500">% da Receita</th>
                    <th className="px-4 py-2 w-32 text-xs text-zinc-500">Representação</th>
                  </tr>
                </thead>
                <tbody>
                  {dreData.expensesByCategory.map((cat, i) => (
                    <tr key={i} className="border-b border-zinc-800/50">
                      <td className="px-4 py-2.5 text-zinc-200 text-sm">{cat.name}</td>
                      <td className="px-4 py-2.5 text-right text-red-400 font-medium">{formatCurrency(cat.amount)}</td>
                      <td className="px-4 py-2.5 text-right text-zinc-400 text-xs">{formatPercent(cat.percentage)}</td>
                      <td className="px-4 py-2.5">
                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-red-500 rounded-full" style={{ width: `${Math.min(cat.percentage, 100)}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-zinc-700">
                    <td className="px-4 py-3 font-semibold text-zinc-100">Total</td>
                    <td className="px-4 py-3 text-right font-bold text-red-400">{formatCurrency(dreData.expenses)}</td>
                    <td className="px-4 py-3 text-right font-medium text-zinc-400">
                      {formatPercent(dreData.income > 0 ? (dreData.expenses / dreData.income) * 100 : 0)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* ── Revenue Report ───────────────────────────────────────────────── */}
        {revenueData && (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-zinc-100">Análise de Receita</h3>
                <p className="text-xs text-zinc-500 mt-0.5">{periodLabel(revenueData.period)}</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleExportRevenueCSV}>
                <Download className="w-4 h-4" /> Exportar CSV
              </Button>
            </div>

            {/* ── Row 1: KPI cards ──────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Receita Total */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-zinc-500">Receita Total</span>
                </div>
                <p className="text-xl font-bold text-emerald-400">
                  {formatCurrency(revenueData.summary.totalIncome)}
                </p>
                <p className="text-xs text-zinc-600 mt-1">
                  {revenueData.summary.transactionCount} lançamentos
                </p>
              </div>

              {/* Ticket Médio */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ShoppingBag className="w-4 h-4 text-violet-400" />
                  <span className="text-xs text-zinc-500">Ticket Médio</span>
                </div>
                <p className="text-xl font-bold text-violet-400">
                  {formatCurrency(revenueData.summary.avgTicket)}
                </p>
                <p className="text-xs text-zinc-600 mt-1">por lançamento</p>
              </div>

              {/* Média por Dia */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-amber-400" />
                  <span className="text-xs text-zinc-500">Média por Dia</span>
                </div>
                <p className="text-xl font-bold text-amber-400">
                  {formatCurrency(revenueData.summary.avgPerDay)}
                </p>
                <p className="text-xs text-zinc-600 mt-1">
                  em {revenueData.summary.dayCount} dias
                </p>
              </div>

              {/* Média por Semana */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="w-4 h-4 text-sky-400" />
                  <span className="text-xs text-zinc-500">Média por Semana</span>
                </div>
                <p className="text-xl font-bold text-sky-400">
                  {formatCurrency(revenueData.summary.avgPerWeek)}
                </p>
                <p className="text-xs text-zinc-600 mt-1">
                  em {revenueData.summary.weekCount} semanas
                </p>
              </div>
            </div>

            {/* ── Row 2: Highlights — melhor semana + melhor dia ────────────── */}
            {(revenueData.topWeek || revenueData.bestDayOfWeek) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {revenueData.topWeek && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-orange-600/20 border border-orange-600/30 flex items-center justify-center shrink-0">
                      <Flame className="w-5 h-5 text-orange-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-500 mb-0.5">Melhor Semana do Período</p>
                      <p className="font-semibold text-zinc-100">{revenueData.topWeek.label}</p>
                      <p className="text-xs text-zinc-500">
                        {revenueData.topWeek.count} lançamentos nessa semana
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-orange-400">
                        {formatCurrency(revenueData.topWeek.amount)}
                      </p>
                      <p className="text-xs text-zinc-500">em receitas</p>
                    </div>
                  </div>
                )}
                {revenueData.bestDayOfWeek && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-yellow-600/20 border border-yellow-600/30 flex items-center justify-center shrink-0">
                      <Star className="w-5 h-5 text-yellow-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-500 mb-0.5">Melhor Dia da Semana</p>
                      <p className="font-semibold text-zinc-100 text-lg">
                        {revenueData.bestDayOfWeek.day}
                      </p>
                      <p className="text-xs text-zinc-500">maior volume de receita</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-yellow-400">
                        {formatCurrency(revenueData.bestDayOfWeek.amount)}
                      </p>
                      <p className="text-xs text-zinc-500">acumulado no período</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Row 3: Ranking Produtos + Ranking Clientes ────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Ranking de Produtos (income categories) */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-sm font-semibold text-zinc-100">Ranking de Produtos</h4>
                  <span className="ml-auto text-xs text-zinc-600">
                    {revenueData.byProduct.length} categorias
                  </span>
                </div>
                {revenueData.byProduct.length === 0 ? (
                  <div className="px-4 py-8 text-center text-zinc-600 text-sm">
                    Nenhuma receita no período
                  </div>
                ) : (
                  <div className="overflow-y-auto max-h-80">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-zinc-900">
                        <tr className="border-b border-zinc-800">
                          <th className="text-left px-4 py-2 text-xs text-zinc-500">#</th>
                          <th className="text-left px-4 py-2 text-xs text-zinc-500">Produto</th>
                          <th className="text-right px-4 py-2 text-xs text-zinc-500">Receita</th>
                          <th className="text-right px-4 py-2 text-xs text-zinc-500">Ticket</th>
                        </tr>
                      </thead>
                      <tbody>
                        {revenueData.byProduct.map((p, i) => {
                          const medals = ["🥇", "🥈", "🥉"];
                          return (
                            <tr key={i} className="border-b border-zinc-800/40 hover:bg-zinc-800/30">
                              <td className="px-4 py-2.5 text-xs w-8 text-center">
                                {i < 3
                                  ? <span>{medals[i]}</span>
                                  : <span className="text-zinc-600">#{i + 1}</span>
                                }
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div
                                    className="w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: p.color }}
                                  />
                                  <div>
                                    <p className="text-zinc-200 text-xs font-medium">{p.name}</p>
                                    <p className="text-zinc-600 text-xs">{p.count} vendas · {formatPercent(p.pctOfRevenue)} do total</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <p className="text-emerald-400 font-semibold text-xs">{formatCurrency(p.amount)}</p>
                                <div className="h-1 w-16 bg-zinc-800 rounded-full overflow-hidden ml-auto mt-1">
                                  <div
                                    className="h-full rounded-full bg-emerald-500"
                                    style={{ width: `${Math.min(p.pctOfRevenue, 100)}%` }}
                                  />
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-right text-xs text-zinc-400">
                                {formatCurrency(p.avgTicket)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Ranking de Clientes */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
                  <Users className="w-4 h-4 text-sky-400" />
                  <h4 className="text-sm font-semibold text-zinc-100">Ranking de Clientes</h4>
                  <span className="ml-auto text-xs text-zinc-600">
                    top {revenueData.byCustomer.length}
                  </span>
                </div>
                {revenueData.byCustomer.length === 0 ? (
                  <div className="px-4 py-8 text-center text-zinc-600 text-sm">
                    Nenhum cliente vinculado a receitas
                  </div>
                ) : (
                  <div className="p-3 space-y-1.5 overflow-y-auto max-h-80">
                    {revenueData.byCustomer.map((c, i) => {
                      const medals = ["🥇", "🥈", "🥉"];
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-800/50"
                        >
                          <span className="text-sm w-6 text-center shrink-0">
                            {i < 3
                              ? medals[i]
                              : <span className="text-zinc-600 text-xs">#{i + 1}</span>
                            }
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-zinc-200 font-medium truncate">{c.name}</p>
                            <p className="text-xs text-zinc-600">
                              {c.count} compra{c.count !== 1 ? "s" : ""} · ticket {formatCurrency(c.avgTicket)}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold text-emerald-400">
                              {formatCurrency(c.amount)}
                            </p>
                            <p className="text-xs text-zinc-600">
                              {formatPercent(c.pctOfRevenue)} do total
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ── Row 4: Weekly Bar Chart ───────────────────────────────────── */}
            {revenueData.byWeek.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-sm font-semibold text-zinc-100">Receita por Semana</h4>
                  {revenueData.topWeek && (
                    <span className="ml-auto text-xs text-zinc-500">
                      Pico: <span className="text-orange-400 font-medium">{revenueData.topWeek.label}</span>
                    </span>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={revenueData.byWeek}
                    margin={{ top: 4, right: 8, left: 8, bottom: 20 }}
                  >
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#71717a", fontSize: 10 }}
                      angle={-30}
                      textAnchor="end"
                      interval={0}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#71717a", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => {
                        if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
                        if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
                        return String(v);
                      }}
                      width={50}
                    />
                    <Tooltip content={<RevenueTooltip />} cursor={{ fill: "#27272a" }} />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                      {revenueData.byWeek.map((entry, index) => (
                        <Cell
                          key={index}
                          fill={
                            revenueData.topWeek && entry.label === revenueData.topWeek.label
                              ? "#f97316"
                              : "#10b98166"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── Row 5: Dia da Semana + Período do Mês ────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Por Dia da Semana */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Star className="w-4 h-4 text-yellow-400" />
                  <h4 className="text-sm font-semibold text-zinc-100">Receita por Dia da Semana</h4>
                </div>
                <div className="space-y-2.5">
                  {(() => {
                    const maxAmount = Math.max(...revenueData.byDayOfWeek.map((d) => d.amount), 1);
                    return revenueData.byDayOfWeek.map((d, i) => {
                      const isBest =
                        revenueData.bestDayOfWeek &&
                        d.day === revenueData.bestDayOfWeek.day;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <span
                            className={`text-xs font-medium w-8 shrink-0 ${isBest ? "text-yellow-400" : "text-zinc-500"}`}
                          >
                            {d.day}
                          </span>
                          <div className="flex-1 h-6 bg-zinc-800 rounded-md overflow-hidden">
                            <div
                              className="h-full rounded-md flex items-center transition-all"
                              style={{
                                width: `${maxAmount > 0 ? (d.amount / maxAmount) * 100 : 0}%`,
                                backgroundColor: isBest ? "#f59e0b" : "#10b981",
                                opacity: d.amount === 0 ? 0.15 : 0.75,
                              }}
                            />
                          </div>
                          <span className={`text-xs font-medium w-24 text-right shrink-0 ${isBest ? "text-yellow-400" : "text-zinc-400"}`}>
                            {d.amount > 0 ? formatCurrency(d.amount) : "—"}
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Por Período do Mês */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="w-4 h-4 text-indigo-400" />
                  <h4 className="text-sm font-semibold text-zinc-100">Receita por Período do Mês</h4>
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart
                    data={revenueData.byPeriodOfMonth}
                    margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
                  >
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
                        if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
                        if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
                        return String(v);
                      }}
                      width={50}
                    />
                    <Tooltip content={<RevenueTooltip />} cursor={{ fill: "#27272a" }} />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                      {revenueData.byPeriodOfMonth.map((entry, index) => {
                        const maxP = Math.max(...revenueData.byPeriodOfMonth.map((p) => p.amount), 1);
                        const isBest = entry.amount === maxP && entry.amount > 0;
                        return (
                          <Cell
                            key={index}
                            fill={isBest ? "#6366f1" : "#6366f166"}
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                {/* Period stats below */}
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {revenueData.byPeriodOfMonth.map((p, i) => {
                    const total = revenueData.summary.totalIncome;
                    const pct = total > 0 ? (p.amount / total) * 100 : 0;
                    return (
                      <div key={i} className="text-center">
                        <p className="text-xs text-zinc-500">{p.label}</p>
                        <p className="text-xs font-semibold text-indigo-400 mt-0.5">
                          {formatPercent(pct, 0)}
                        </p>
                        <p className="text-xs text-zinc-600">{p.count} lançamentos</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Detailed Expenses Report ─────────────────────────────────────── */}
        {detailedData && (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-zinc-100">Análise Detalhada de Despesas</h3>
                <p className="text-xs text-zinc-500 mt-0.5">{periodLabel(detailedData.period)}</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleExportDetailedCSV}>
                <Download className="w-4 h-4" /> Exportar CSV
              </Button>
            </div>

            {/* ── Row 1: Summary KPI cards ─────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="w-4 h-4 text-red-400" />
                  <span className="text-xs text-zinc-500">Total Despesas</span>
                </div>
                <p className="text-xl font-bold text-red-400">
                  {formatCurrency(detailedData.summary.totalExpenses)}
                </p>
                <p className="text-xs text-zinc-600 mt-1">
                  {detailedData.summary.expenseCount} lançamentos
                </p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-amber-400" />
                  <span className="text-xs text-zinc-500">Média por Dia</span>
                </div>
                <p className="text-xl font-bold text-amber-400">
                  {formatCurrency(detailedData.summary.avgExpensePerDay)}
                </p>
                <p className="text-xs text-zinc-600 mt-1">gasto médio diário</p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Flame className="w-4 h-4 text-orange-400" />
                  <span className="text-xs text-zinc-500">Semana Mais Cara</span>
                </div>
                {detailedData.topWeek ? (
                  <>
                    <p className="text-xl font-bold text-orange-400">
                      {formatCurrency(detailedData.topWeek.amount)}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">{detailedData.topWeek.label}</p>
                  </>
                ) : (
                  <p className="text-sm text-zinc-600">—</p>
                )}
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-4 h-4 text-violet-400" />
                  <span className="text-xs text-zinc-500">Maior Departamento</span>
                </div>
                {detailedData.topDepartment ? (
                  <>
                    <p className="text-xl font-bold text-violet-400">
                      {formatCurrency(detailedData.topDepartment.amount)}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1 truncate">
                      {detailedData.topDepartment.name}
                      <span className="text-zinc-600 ml-1">
                        ({formatPercent(detailedData.topDepartment.pctOfExpenses)})
                      </span>
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-zinc-600">—</p>
                )}
              </div>
            </div>

            {/* ── Row 2: Secondary highlights ──────────────────────────────── */}
            {(detailedData.topContact || detailedData.payroll.total > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {detailedData.topContact && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-600/30 flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-500 mb-0.5">Contato com Maior Despesa</p>
                      <p className="font-semibold text-zinc-100 truncate">{detailedData.topContact.name}</p>
                      <p className="text-xs text-zinc-500">
                        {detailedData.topContact.count} lançamentos
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-blue-400">
                        {formatCurrency(detailedData.topContact.amount)}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {formatPercent(detailedData.topContact.pctOfExpenses)} das despesas
                      </p>
                    </div>
                  </div>
                )}

                {detailedData.payroll.total > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-600/30 flex items-center justify-center shrink-0">
                      <Wallet className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-500 mb-0.5">Folha de Pagamento</p>
                      <p className="font-semibold text-zinc-100">
                        {formatCurrency(detailedData.payroll.total)}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {detailedData.payroll.byDepartment.length} departamento(s)
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-emerald-400">
                        {formatPercent(detailedData.payroll.pctOfExpenses)}
                      </p>
                      <p className="text-xs text-zinc-500">das despesas totais</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Row 3: Categories + Departments ──────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* By Category */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-indigo-400" />
                  <h4 className="text-sm font-semibold text-zinc-100">Despesas por Categoria</h4>
                  <span className="ml-auto text-xs text-zinc-600">
                    {detailedData.byCategory.length} categorias
                  </span>
                </div>
                <div className="overflow-y-auto max-h-80">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-zinc-900">
                      <tr className="border-b border-zinc-800">
                        <th className="text-left px-4 py-2 text-xs text-zinc-500">#</th>
                        <th className="text-left px-4 py-2 text-xs text-zinc-500">Categoria</th>
                        <th className="text-right px-4 py-2 text-xs text-zinc-500">Valor</th>
                        <th className="text-right px-4 py-2 text-xs text-zinc-500">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailedData.byCategory.map((cat, i) => (
                        <tr key={i} className="border-b border-zinc-800/40 hover:bg-zinc-800/30">
                          <td className="px-4 py-2.5 text-xs text-zinc-600 w-8">{i + 1}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: cat.color }}
                              />
                              <div>
                                <p className="text-zinc-200 text-xs font-medium">{cat.name}</p>
                                <p className="text-zinc-600 text-xs">{cat.count} lançamentos</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right text-red-400 font-medium text-xs">
                            {formatCurrency(cat.amount)}
                          </td>
                          <td className="px-4 py-2.5 text-right w-24">
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="text-xs text-zinc-400">{formatPercent(cat.pctOfExpenses)}</span>
                              <div className="h-1 w-16 bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${Math.min(cat.pctOfExpenses, 100)}%`,
                                    backgroundColor: cat.color,
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* By Department */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-violet-400" />
                  <h4 className="text-sm font-semibold text-zinc-100">Despesas por Departamento</h4>
                  <span className="ml-auto text-xs text-zinc-600">
                    {detailedData.byDepartment.length} departamentos
                  </span>
                </div>
                <div className="overflow-y-auto max-h-80">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-zinc-900">
                      <tr className="border-b border-zinc-800">
                        <th className="text-left px-4 py-2 text-xs text-zinc-500">#</th>
                        <th className="text-left px-4 py-2 text-xs text-zinc-500">Departamento</th>
                        <th className="text-right px-4 py-2 text-xs text-zinc-500">Valor</th>
                        <th className="text-right px-4 py-2 text-xs text-zinc-500">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailedData.byDepartment.map((dept, i) => {
                        const budgetUtil = dept.budgetUtilPct;
                        const budgetColor =
                          dept.budget === 0
                            ? "#6b7280"
                            : budgetUtil < 80
                            ? "#10b981"
                            : budgetUtil <= 100
                            ? "#f59e0b"
                            : "#ef4444";
                        return (
                          <tr key={i} className="border-b border-zinc-800/40 hover:bg-zinc-800/30">
                            <td className="px-4 py-2.5 text-xs text-zinc-600 w-8">{i + 1}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: dept.color }}
                                />
                                <div>
                                  <p className="text-zinc-200 text-xs font-medium">{dept.name}</p>
                                  {dept.budget > 0 && (
                                    <p className="text-xs" style={{ color: budgetColor }}>
                                      {formatPercent(budgetUtil, 0)} do budget
                                      {budgetUtil > 100 && (
                                        <AlertTriangle className="w-2.5 h-2.5 inline ml-0.5" />
                                      )}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right text-red-400 font-medium text-xs">
                              {formatCurrency(dept.amount)}
                            </td>
                            <td className="px-4 py-2.5 text-right w-24">
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="text-xs text-zinc-400">
                                  {formatPercent(dept.pctOfExpenses)}
                                </span>
                                <div className="h-1 w-16 bg-zinc-800 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${Math.min(dept.pctOfExpenses, 100)}%`,
                                      backgroundColor: dept.color,
                                    }}
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* ── Row 4: Weekly Distribution ────────────────────────────────── */}
            {detailedData.byWeek.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="w-4 h-4 text-orange-400" />
                  <h4 className="text-sm font-semibold text-zinc-100">Distribuição Semanal de Despesas</h4>
                  {detailedData.topWeek && (
                    <span className="ml-auto text-xs text-zinc-500">
                      Pico: <span className="text-orange-400 font-medium">{detailedData.topWeek.label}</span>
                    </span>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={detailedData.byWeek} margin={{ top: 4, right: 8, left: 8, bottom: 20 }}>
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#71717a", fontSize: 10 }}
                      angle={-30}
                      textAnchor="end"
                      interval={0}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#71717a", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => {
                        if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
                        if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
                        return String(v);
                      }}
                      width={50}
                    />
                    <Tooltip content={<WeekTooltip />} cursor={{ fill: "#27272a" }} />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                      {detailedData.byWeek.map((entry, index) => (
                        <Cell
                          key={index}
                          fill={
                            detailedData.topWeek && entry.label === detailedData.topWeek.label
                              ? "#f97316"
                              : "#ef444466"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── Row 5: Contacts + Payroll by Dept ────────────────────────── */}
            {(detailedData.byContact.length > 0 || detailedData.payroll.byDepartment.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {detailedData.byContact.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
                      <User className="w-4 h-4 text-blue-400" />
                      <h4 className="text-sm font-semibold text-zinc-100">Top Contatos / Responsáveis</h4>
                    </div>
                    <div className="p-3 space-y-1.5">
                      {detailedData.byContact.map((contact, i) => {
                        const medals = ["🥇", "🥈", "🥉"];
                        return (
                          <div
                            key={i}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-800/50"
                          >
                            <span className="text-sm w-6 text-center shrink-0">
                              {i < 3 ? medals[i] : <span className="text-zinc-600 text-xs">#{i + 1}</span>}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-zinc-200 font-medium truncate">{contact.name}</p>
                              <p className="text-xs text-zinc-600">{contact.count} lançamentos</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-semibold text-red-400">
                                {formatCurrency(contact.amount)}
                              </p>
                              <p className="text-xs text-zinc-600">
                                {formatPercent(contact.pctOfExpenses)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {detailedData.payroll.byDepartment.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-emerald-400" />
                      <h4 className="text-sm font-semibold text-zinc-100">Folha por Departamento</h4>
                      <span className="ml-auto text-xs text-zinc-500">
                        Total: <span className="text-emerald-400 font-medium">{formatCurrency(detailedData.payroll.total)}</span>
                      </span>
                    </div>
                    <div className="p-4 space-y-3">
                      {detailedData.payroll.byDepartment.map((p, i) => (
                        <div key={i}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-zinc-300 font-medium">{p.name}</span>
                            <div className="text-right">
                              <span className="text-xs text-emerald-400 font-medium">
                                {formatCurrency(p.amount)}
                              </span>
                              <span className="text-xs text-zinc-600 ml-1.5">
                                {formatPercent(p.pctOfPayroll)}
                              </span>
                            </div>
                          </div>
                          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${p.pctOfPayroll}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Empty state ──────────────────────────────────────────────────── */}
        {!hasData && !loading && (
          <div className="flex flex-col items-center justify-center py-24 text-zinc-500">
            <BarChart3 className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm">Selecione o tipo de relatório e clique em Gerar</p>
          </div>
        )}
      </div>
    </>
  );
}
