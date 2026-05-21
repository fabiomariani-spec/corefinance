"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CurrencyInput } from "@/components/ui/currency-input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatCurrency, formatDate, formatStatus } from "@/lib/formatters";
import { toast } from "@/lib/toast";
import {
  ChevronLeft,
  Loader2,
  CreditCard,
  Calendar,
  Trash2,
  Pencil,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Save,
  X,
} from "lucide-react";

type InvoiceStatus = "OPEN" | "CLOSED" | "PAID" | "PROCESSING";

interface InvoiceTransaction {
  id: string;
  description: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  status: string;
  competenceDate: string;
  dueDate: string | null;
  paymentDate: string | null;
  paymentMethod: string | null;
  notes: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  category: { id: string; name: string; color: string } | null;
  department: { id: string; name: string; color: string } | null;
}

interface InvoiceDetail {
  id: string;
  creditCardId: string;
  referenceMonth: number;
  closingDate: string;
  dueDate: string;
  totalAmount: number;
  status: InvoiceStatus;
  fileName: string | null;
  fileUrl: string | null;
  importedAt: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
  creditCard: {
    id: string;
    name: string;
    brand: string;
    color: string;
    lastFour: string | null;
    bank: string | null;
    closingDay: number;
    dueDay: number;
  };
  transactionsCount: number;
  transactions: InvoiceTransaction[];
}

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  OPEN: "Aberta",
  CLOSED: "Fechada",
  PAID: "Paga",
  PROCESSING: "Processando",
};

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  OPEN: "bg-amber-600/20 text-amber-400",
  CLOSED: "bg-indigo-600/20 text-indigo-400",
  PAID: "bg-emerald-600/20 text-emerald-400",
  PROCESSING: "bg-zinc-700 text-zinc-300",
};

const STATUS_ICONS: Record<InvoiceStatus, typeof Clock> = {
  OPEN: Clock,
  CLOSED: AlertCircle,
  PAID: CheckCircle2,
  PROCESSING: Loader2,
};

const TX_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-600/20 text-amber-400",
  PREDICTED: "bg-zinc-700 text-zinc-300",
  PAID: "bg-emerald-600/20 text-emerald-400",
  RECEIVED: "bg-emerald-600/20 text-emerald-400",
  OVERDUE: "bg-red-600/20 text-red-400",
  CANCELLED: "bg-zinc-700 text-zinc-500",
};

/** YYYYMM Int → "Março de 2025" */
function formatReferenceMonth(refMonth: number): string {
  const s = String(refMonth);
  if (s.length !== 6) return s;
  const year = s.slice(0, 4);
  const month = parseInt(s.slice(4, 6), 10);
  const date = new Date(parseInt(year), month - 1, 1);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

/** ISO date or YYYY-MM-DD → input[type=date] value (YYYY-MM-DD). */
function toDateInputValue(d: string | null | undefined): string {
  if (!d) return "";
  return d.slice(0, 10);
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<{ status: InvoiceStatus; dueDate: string; totalAmount: number }>({
    status: "OPEN",
    dueDate: "",
    totalAmount: 0,
  });

  // Delete confirmation
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [forceDelete, setForceDelete] = useState(false);
  const [paidConflict, setPaidConflict] = useState<{ count: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/${id}`);
      if (res.status === 404) {
        router.push("/faturas");
        return;
      }
      if (!res.ok) return;
      const data: InvoiceDetail = await res.json();
      setInvoice(data);
      setEditForm({
        status: data.status,
        dueDate: toDateInputValue(data.dueDate),
        totalAmount: data.totalAmount,
      });
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  async function handleSaveEdit() {
    if (!invoice) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: editForm.status,
          dueDate: editForm.dueDate,
          totalAmount: editForm.totalAmount,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Erro ao salvar");
        return;
      }
      toast.success("Fatura atualizada");
      setEditing(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    if (!invoice) return;
    setEditForm({
      status: invoice.status,
      dueDate: toDateInputValue(invoice.dueDate),
      totalAmount: invoice.totalAmount,
    });
    setEditing(false);
  }

  async function handleDelete() {
    if (!invoice) return;
    // If we already know there's a paid conflict, require the user to check
    // "force" before re-submitting. Avoids re-triggering 409 unnecessarily.
    if (paidConflict && !forceDelete) {
      toast.error("Marque a opção 'Excluir mesmo assim' para confirmar");
      return;
    }
    setDeleting(true);
    try {
      const url = forceDelete
        ? `/api/invoices/${id}?force=true`
        : `/api/invoices/${id}`;
      const res = await fetch(url, { method: "DELETE" });
      if (res.status === 409) {
        const data = await res.json().catch(() => ({}));
        setPaidConflict({ count: data.paidTransactionsCount ?? 0 });
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Erro ao excluir");
        return;
      }
      const data = await res.json();
      toast.success(
        `Fatura excluída · ${data.deletedTransactions ?? 0} ${data.deletedTransactions === 1 ? "lançamento removido" : "lançamentos removidos"}`,
      );
      router.push("/faturas");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    );
  }
  if (!invoice) return null;

  const StatusIcon = STATUS_ICONS[invoice.status] ?? Clock;
  const refMonthLabel = formatReferenceMonth(invoice.referenceMonth);
  const purchases = invoice.transactions.filter((t) => t.type === "EXPENSE").reduce((s, t) => s + t.amount, 0);
  const credits = invoice.transactions.filter((t) => t.type === "INCOME").reduce((s, t) => s + t.amount, 0);
  const paidTransactions = invoice.transactions.filter((t) => t.paymentDate).length;

  return (
    <>
      <Header
        title={`${invoice.creditCard.name} · ${refMonthLabel}`}
        subtitle={
          <span className="flex items-center gap-2 text-zinc-500">
            <button
              onClick={() => router.push("/faturas")}
              className="hover:text-zinc-300 flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Faturas
            </button>
            <span>/</span>
            <span className="capitalize">{refMonthLabel}</span>
          </span>
        }
      />
      <div className="flex-1 p-6 space-y-6">
        {/* Header card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: invoice.creditCard.color + "30",
                  border: `1px solid ${invoice.creditCard.color}40`,
                }}
              >
                <CreditCard
                  className="w-6 h-6"
                  style={{ color: invoice.creditCard.color }}
                />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-zinc-100 capitalize">{refMonthLabel}</h2>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[invoice.status] ?? "bg-zinc-700 text-zinc-400"}`}
                  >
                    <StatusIcon className={`w-3 h-3 ${invoice.status === "PROCESSING" ? "animate-spin" : ""}`} />
                    {STATUS_LABELS[invoice.status]}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-zinc-400 flex-wrap">
                  <span>{invoice.creditCard.name}</span>
                  {invoice.creditCard.lastFour && (
                    <span className="text-zinc-500">**** {invoice.creditCard.lastFour}</span>
                  )}
                  {invoice.creditCard.bank && (
                    <span className="text-zinc-500">{invoice.creditCard.bank}</span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    Vence em {formatDate(invoice.dueDate)}
                  </span>
                </div>
                {invoice.importedAt && (
                  <p className="text-xs text-zinc-600">
                    Importada em {formatDate(invoice.importedAt, "dd/MM/yyyy 'às' HH:mm")}
                    {invoice.fileName && ` · ${invoice.fileName}`}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <p className="text-xs text-zinc-500">Total da fatura</p>
              <p className="text-2xl font-bold text-zinc-100">
                {formatCurrency(invoice.totalAmount)}
              </p>
              {!editing && (
                <div className="flex items-center gap-2 mt-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                    <Pencil className="w-3.5 h-3.5 mr-1.5" /> Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-900/60 text-red-400 hover:bg-red-950/30 hover:text-red-300"
                    onClick={() => {
                      setForceDelete(false);
                      setPaidConflict(null);
                      setDeleteOpen(true);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Excluir
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Edit form */}
        {editing && (
          <div className="bg-zinc-900 border border-indigo-900/60 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100">Editar fatura</h3>
              <span className="text-xs text-zinc-500">
                Cartão e mês de referência são imutáveis — para alterar, exclua e reimporte.
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={editForm.status}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, status: v as InvoiceStatus }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABELS) as InvoiceStatus[]).map((k) => (
                      <SelectItem key={k} value={k}>{STATUS_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Vencimento</Label>
                <Input
                  type="date"
                  value={editForm.dueDate}
                  onChange={(e) => setEditForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Total da fatura</Label>
                <CurrencyInput
                  value={editForm.totalAmount}
                  onChange={(n) => setEditForm((f) => ({ ...f, totalAmount: n }))}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                <X className="w-4 h-4 mr-1.5" /> Cancelar
              </Button>
              <Button onClick={handleSaveEdit} disabled={saving || !editForm.dueDate}>
                {saving ? (
                  <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Salvando...</>
                ) : (
                  <><Save className="w-4 h-4 mr-1.5" /> Salvar</>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* KPI summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Lançamentos", value: invoice.transactionsCount, color: "text-indigo-400", bg: "bg-indigo-600/10", isCurrency: false },
            { label: "Compras", value: purchases, color: "text-zinc-200", bg: "bg-zinc-700/30", isCurrency: true },
            { label: "Créditos / Estornos", value: credits, color: "text-emerald-400", bg: "bg-emerald-600/10", isCurrency: true },
            { label: "Já pagos", value: paidTransactions, color: "text-emerald-400", bg: "bg-emerald-600/10", isCurrency: false },
          ].map(({ label, value, color, bg, isCurrency }) => (
            <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex flex-col gap-1">
              <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>
                <FileText className={`w-3.5 h-3.5 ${color}`} />
              </div>
              <p className="text-xs text-zinc-500 mt-1">{label}</p>
              <p className={`text-sm font-bold ${color}`}>
                {isCurrency ? formatCurrency(value) : value}
              </p>
            </div>
          ))}
        </div>

        {/* Transactions table */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100">
              Lançamentos vinculados ({invoice.transactionsCount})
            </h3>
            {invoice.transactions.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/lancamentos")}
              >
                Ver em lançamentos
              </Button>
            )}
          </div>
          {invoice.transactions.length === 0 ? (
            <div className="flex flex-col items-center py-14 gap-2">
              <FileText className="w-8 h-8 text-zinc-700" />
              <p className="text-sm text-zinc-500">Nenhum lançamento vinculado a esta fatura</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    {["Data", "Descrição", "Parcela", "Categoria", "Status", "Valor"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-zinc-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoice.transactions.map((tx) => (
                    <tr
                      key={tx.id}
                      className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="px-4 py-2.5 text-zinc-400 text-xs whitespace-nowrap">
                        {formatDate(tx.competenceDate)}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-zinc-200 text-xs max-w-[280px] truncate">{tx.description}</p>
                        {tx.notes && (
                          <p className="text-zinc-500 text-xs truncate max-w-[280px]">{tx.notes}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-500 text-xs whitespace-nowrap">
                        {tx.installmentNumber && tx.installmentTotal
                          ? `${tx.installmentNumber}/${tx.installmentTotal}`
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {tx.category ? (
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: tx.category.color + "20",
                              color: tx.category.color,
                            }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: tx.category.color }}
                            />
                            {tx.category.name}
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TX_STATUS_COLORS[tx.status] ?? "bg-zinc-700 text-zinc-400"}`}
                        >
                          {formatStatus(tx.status)}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 text-right text-xs font-semibold whitespace-nowrap ${tx.type === "INCOME" ? "text-emerald-400" : "text-zinc-200"}`}>
                        {tx.type === "INCOME" ? "+" : ""}{formatCurrency(tx.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => {
          setDeleteOpen(false);
          setPaidConflict(null);
          setForceDelete(false);
        }}
        onConfirm={handleDelete}
        title="Excluir fatura?"
        message={
          <div className="space-y-2">
            <p>
              Esta ação remove a fatura{" "}
              <strong className="text-zinc-100">{invoice.creditCard.name} · {refMonthLabel}</strong>{" "}
              e todos os <strong className="text-zinc-100">{invoice.transactionsCount}</strong>{" "}
              {invoice.transactionsCount === 1 ? "lançamento vinculado" : "lançamentos vinculados"}.
            </p>
            <p className="text-xs text-zinc-500">
              Lançamentos importados desta fatura serão excluídos junto. Esta ação não pode ser desfeita.
            </p>
            {paidConflict && (
              <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 space-y-2">
                <p className="text-xs text-amber-300 flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    Existem <strong>{paidConflict.count}</strong>{" "}
                    {paidConflict.count === 1 ? "lançamento já pago" : "lançamentos já pagos"} nesta fatura.
                    Marque a opção abaixo para excluir mesmo assim.
                  </span>
                </p>
                <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer pl-5">
                  <input
                    type="checkbox"
                    checked={forceDelete}
                    onChange={(e) => setForceDelete(e.target.checked)}
                    className="rounded"
                  />
                  Excluir mesmo assim (forçar)
                </label>
              </div>
            )}
          </div>
        }
        confirmLabel={paidConflict ? "Excluir forçado" : "Excluir fatura"}
        loadingLabel="Excluindo..."
        loading={deleting}
      />
    </>
  );
}
