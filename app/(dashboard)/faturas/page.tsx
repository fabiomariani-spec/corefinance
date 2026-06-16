"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  Loader2,
  ChevronRight,
  FileText,
  Upload,
  CreditCard,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

interface InvoiceListItem {
  id: string;
  creditCardId: string;
  referenceMonth: number;
  closingDate: string;
  dueDate: string;
  totalAmount: number;
  status: "OPEN" | "CLOSED" | "PAID" | "PROCESSING";
  fileName: string | null;
  importedAt: string | null;
  processedAt: string | null;
  createdAt: string;
  creditCard: {
    id: string;
    name: string;
    brand: string;
    color: string;
    lastFour: string | null;
  };
  transactionsCount: number;
}

interface CardData {
  id: string;
  name: string;
  brand: string;
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Aberta",
  CLOSED: "Fechada",
  PAID: "Paga",
  PROCESSING: "Processando",
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-amber-600/20 text-amber-400",
  CLOSED: "bg-indigo-600/20 text-indigo-400",
  PAID: "bg-emerald-600/20 text-emerald-400",
  PROCESSING: "bg-zinc-700 text-zinc-300",
};

const STATUS_ICONS: Record<string, typeof Clock> = {
  OPEN: Clock,
  CLOSED: AlertCircle,
  PAID: CheckCircle2,
  PROCESSING: Loader2,
};

/** Converte YYYYMM (Int) em string legível "Mar / 2025". */
function formatReferenceMonth(refMonth: number): string {
  const s = String(refMonth);
  if (s.length !== 6) return s;
  const year = s.slice(0, 4);
  const month = parseInt(s.slice(4, 6), 10);
  const date = new Date(parseInt(year), month - 1, 1);
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" })
    .format(date)
    .replace(".", "");
}

export default function FaturasListPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [cards, setCards] = useState<CardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [cardFilter, setCardFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [, startTransition] = useTransition();

  const load = useCallback(async (initial: boolean) => {
    if (initial) setLoading(true);
    else setRefetching(true);
    try {
      const params = new URLSearchParams();
      if (cardFilter !== "all") params.set("cardId", cardFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/invoices?${params.toString()}`);
      if (res.ok) {
        const data: InvoiceListItem[] = await res.json();
        setInvoices(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
      setRefetching(false);
    }
  }, [cardFilter, statusFilter]);

  useEffect(() => { load(true); }, [load]);

  useEffect(() => {
    fetch("/api/credit-cards")
      .then((r) => r.json())
      .then((data) => setCards(Array.isArray(data) ? data : []))
      .catch(() => setCards([]));
  }, []);

  // KPIs agregados (todas as faturas do filtro atual)
  const totalAmount = invoices.reduce((s, i) => s + i.totalAmount, 0);
  const paidCount = invoices.filter((i) => i.status === "PAID").length;
  const openCount = invoices.filter((i) => i.status === "OPEN" || i.status === "CLOSED").length;
  const totalTransactions = invoices.reduce((s, i) => s + i.transactionsCount, 0);

  const hasFilters = cardFilter !== "all" || statusFilter !== "all";

  function clearFilters() {
    setCardFilter("all");
    setStatusFilter("all");
  }

  return (
    <>
      <Header
        title="Faturas"
        subtitle="Faturas de cartão importadas"
        actions={
          <Button onClick={() => router.push("/faturas/import")}>
            <Upload className="w-4 h-4 mr-1.5" /> Importar nova fatura
          </Button>
        }
      />
      <div className="flex-1 p-6 space-y-6">
        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Faturas", value: invoices.length, icon: FileText, color: "text-indigo-400", bg: "bg-indigo-600/10", isCurrency: false },
            { label: "Total importado", value: totalAmount, icon: CreditCard, color: "text-zinc-200", bg: "bg-zinc-700/30", isCurrency: true },
            { label: "Em aberto", value: openCount, icon: Clock, color: "text-amber-400", bg: "bg-amber-600/10", isCurrency: false },
            { label: "Pagas", value: paidCount, icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-600/10", isCurrency: false },
          ].map(({ label, value, icon: Icon, color, bg, isCurrency }) => (
            <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <div>
                <p className="text-xs text-zinc-500">{label}</p>
                <p className={`text-lg font-bold ${color}`}>
                  {isCurrency ? formatCurrency(value) : value}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <Select
            value={cardFilter}
            onValueChange={(v) => startTransition(() => setCardFilter(v))}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Todos os cartões" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os cartões</SelectItem>
              {cards.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(v) => startTransition(() => setStatusFilter(v))}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Limpar filtros
            </Button>
          )}
          {refetching && (
            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
          )}
          <div className="flex-1" />
          <span className="text-xs text-zinc-500">
            {totalTransactions} lançamentos vinculados
          </span>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          </div>
        ) : invoices.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={FileText}
              title="Nenhuma fatura corresponde aos filtros"
              description="Tente ajustar os filtros de cartão ou status."
              actionLabel="Limpar filtros"
              onAction={clearFilters}
              actionVariant="outline"
            />
          ) : (
            <EmptyState
              icon={Upload}
              title="Nenhuma fatura importada ainda"
              description="Importe sua primeira fatura de cartão e a IA extrai todos os lançamentos automaticamente."
              actionLabel={
                <>
                  <Upload className="w-4 h-4" /> Importar fatura
                </>
              }
              onAction={() => router.push("/faturas/import")}
            />
          )
        ) : (
          <div className="space-y-3">
            {invoices.map((inv) => {
              const StatusIcon = STATUS_ICONS[inv.status] ?? Clock;
              return (
                <div
                  key={inv.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Abrir fatura ${inv.creditCard.name} · ${formatReferenceMonth(inv.referenceMonth)} · ${formatCurrency(inv.totalAmount)}`}
                  onClick={() => router.push(`/faturas/${inv.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/faturas/${inv.id}`);
                    }
                  }}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 cursor-pointer hover:border-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-indigo-500 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: inv.creditCard.color + "30",
                          border: `1px solid ${inv.creditCard.color}40`,
                        }}
                      >
                        <CreditCard
                          className="w-5 h-5"
                          style={{ color: inv.creditCard.color }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold text-zinc-100 group-hover:text-white truncate">
                            {inv.creditCard.name}
                          </h3>
                          <span className="text-xs text-zinc-500 capitalize">
                            {formatReferenceMonth(inv.referenceMonth)}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${STATUS_COLORS[inv.status] ?? "bg-zinc-700 text-zinc-400"}`}>
                            <StatusIcon className={`w-3 h-3 ${inv.status === "PROCESSING" ? "animate-spin" : ""}`} />
                            {STATUS_LABELS[inv.status] ?? inv.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-zinc-500 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Vence em {formatDate(inv.dueDate)}
                          </span>
                          <span className="flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            {inv.transactionsCount} {inv.transactionsCount === 1 ? "lançamento" : "lançamentos"}
                          </span>
                          {inv.importedAt && (
                            <span>Importada em {formatDate(inv.importedAt)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-5 shrink-0">
                      <div className="text-right">
                        <p className="text-xs text-zinc-500">Total da fatura</p>
                        <p className="font-semibold text-zinc-100 text-lg">
                          {formatCurrency(inv.totalAmount)}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
