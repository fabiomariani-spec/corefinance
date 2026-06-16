"use client";

/**
 * Gráficos do Painel Executivo extraídos pra um componente filho.
 *
 * Recharts é pesado (~150-180KB no first-load). Importando este arquivo via
 * `next/dynamic(() => import(...), { ssr: false })` no painel-client, todo o
 * recharts sai do bundle inicial e só carrega quando o painel monta no client.
 * O comportamento/visual dos gráficos é idêntico ao que estava inline.
 */

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
import { formatCurrency, formatPercent } from "@/lib/formatters";

export const CHART_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#3b82f6", "#ec4899", "#14b8a6", "#f97316", "#84cc16",
];

interface CategoryItem {
  name: string;
  amount: number;
  color: string;
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

// ── Donut: Receita por Produto / Categoria ───────────────────────────────────
export function IncomeCategoryDonut({
  data,
  totalIncomeCategory,
}: {
  data: CategoryItem[];
  totalIncomeCategory: number;
}) {
  return (
    <ResponsiveContainer width={140} height={140}>
      <PieChart>
        <Pie
          data={data}
          dataKey="amount"
          nameKey="name"
          innerRadius={42}
          outerRadius={65}
          paddingAngle={3}
          startAngle={90}
          endAngle={-270}
        >
          {data.map((entry, i) => (
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
  );
}

// ── Line: Tendência de Churn (12m) ───────────────────────────────────────────
export function ChurnTrendChart({
  data,
}: {
  data: { label: string; customerChurnRate: number; revenueChurnRate: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={130}>
      <LineChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
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
  );
}

// ── Area: Fluxo de Caixa (12m) ───────────────────────────────────────────────
export function CashFlowChart({
  data,
}: {
  data: { label: string; income: number; expenses: number; profit: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
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
  );
}
