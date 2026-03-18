import { format, formatDistanceToNow, parseISO, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Moeda BRL ────────────────────────────────────────────────────────────

export function formatCurrency(
  value: number | string | null | undefined,
  options?: { compact?: boolean }
): string {
  const num = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  if (isNaN(num)) return "R$ 0,00";

  if (options?.compact && Math.abs(num) >= 1_000_000) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(num);
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(num);
}

export function formatCurrencyCompact(value: number): string {
  return formatCurrency(value, { compact: true });
}

// ─── Percentuais ─────────────────────────────────────────────────────────

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

// ─── Datas ────────────────────────────────────────────────────────────────

export function formatDate(
  date: Date | string | null | undefined,
  fmt = "dd/MM/yyyy"
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? parseISO(date) : date;
  if (!isValid(d)) return "—";
  return format(d, fmt, { locale: ptBR });
}

export function formatDatetime(date: Date | string | null | undefined): string {
  return formatDate(date, "dd/MM/yyyy 'às' HH:mm");
}

export function formatRelativeDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? parseISO(date) : date;
  if (!isValid(d)) return "—";
  return formatDistanceToNow(d, { addSuffix: true, locale: ptBR });
}

export function formatMonthYear(date: Date | string | null | undefined): string {
  return formatDate(date, "MMMM yyyy");
}

// ─── Números ──────────────────────────────────────────────────────────────

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

// ─── Cartão ───────────────────────────────────────────────────────────────

export function maskCardNumber(lastFour: string | null | undefined): string {
  if (!lastFour) return "**** **** **** ****";
  return `**** **** **** ${lastFour}`;
}

// ─── Status ───────────────────────────────────────────────────────────────

const statusLabels: Record<string, string> = {
  PENDING: "Pendente",
  PREDICTED: "Previsto",
  PAID: "Pago",
  RECEIVED: "Recebido",
  OVERDUE: "Atrasado",
  CANCELLED: "Cancelado",
};

export function formatStatus(status: string): string {
  return statusLabels[status] ?? status;
}

const paymentMethodLabels: Record<string, string> = {
  CREDIT_CARD: "Cartão de Crédito",
  DEBIT_CARD: "Cartão de Débito",
  BANK_TRANSFER: "Transferência",
  PIX: "PIX",
  BOLETO: "Boleto",
  CASH: "Dinheiro",
  CHECK: "Cheque",
  OTHER: "Outro",
};

export function formatPaymentMethod(method: string): string {
  return paymentMethodLabels[method] ?? method;
}

// ─── Variação ─────────────────────────────────────────────────────────────

export function formatVariation(current: number, previous: number): {
  value: number;
  label: string;
  isPositive: boolean;
} {
  if (previous === 0) {
    return { value: 0, label: "—", isPositive: true };
  }
  const variation = ((current - previous) / Math.abs(previous)) * 100;
  return {
    value: variation,
    label: `${variation >= 0 ? "+" : ""}${variation.toFixed(1)}%`,
    isPositive: variation >= 0,
  };
}
