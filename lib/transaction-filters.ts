/**
 * Filtros de data para a listagem de lançamentos.
 *
 * Regra de negócio: o recorte por período usa colunas DIFERENTES conforme o
 * que está sendo olhado:
 *
 *   - Registros realizados (pagos/recebidos) → data de PAGAMENTO (paymentDate).
 *     É quando o dinheiro de fato entrou/saiu. Filtrar "saídas pagas em junho"
 *     deve trazer o que foi quitado em junho, não o que vencia em junho.
 *
 *   - Demais (pendentes/previstos/atrasados) → data de VENCIMENTO (dueDate),
 *     com fallback para a competência quando não há vencimento.
 *
 * O front manda `status=PAID` (chip "Pagos") ou `status=RECEIVED` (chip
 * "Recebidos"); nesses casos a janela recorta por pagamento. Em qualquer outro
 * filtro de status (incluindo "Todos") o recorte segue por vencimento.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

/** Status que representam um lançamento já realizado (dinheiro movimentado). */
export const REALIZED_STATUSES = ["PAID", "RECEIVED"] as const;

/**
 * `true` quando o filtro de status representa SOMENTE registros realizados
 * (pagos/recebidos) — nesse caso o período deve recortar por data de pagamento.
 * Aceita CSV ("PAID,RECEIVED"). Retorna `false` para vazio/"all"/qualquer
 * status não-realizado presente.
 */
export function isRealizedStatusFilter(statusParam: string | null | undefined): boolean {
  if (!statusParam) return false;
  const statuses = statusParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (statuses.length === 0) return false;
  return statuses.every((s) => (REALIZED_STATUSES as readonly string[]).includes(s));
}

export interface DateWindowInput {
  month?: string | null; // "YYYY-MM"
  startDate?: string | null; // "YYYY-MM-DD"
  endDate?: string | null; // "YYYY-MM-DD"
}

export interface DateWindows {
  /** Há algum limite de data (period filter ativo)? */
  hasRange: boolean;
  /** OR por vencimento (com fallback competência quando dueDate é null). */
  dueOr: Where[] | null;
  /** Filtro direto por data de pagamento (realizados sempre têm paymentDate). */
  paymentRange: { paymentDate: { gte?: Date; lte?: Date } } | null;
}

/**
 * Calcula os limites [gte, lte] de um período (via `month` OU `startDate`/
 * `endDate`) e devolve as duas variantes de janela: por vencimento e por
 * pagamento. Datas no horário local (BR) — `T00:00:00`/`T23:59:59` — para
 * cobrir o dia inteiro sem shift de fuso.
 */
export function buildDateWindows({ month, startDate, endDate }: DateWindowInput): DateWindows {
  let gte: Date | undefined;
  let lte: Date | undefined;

  if (month) {
    const [y, m] = month.split("-").map(Number);
    gte = new Date(y, m - 1, 1);
    lte = new Date(y, m, 0, 23, 59, 59);
  } else {
    if (startDate) gte = new Date(startDate + "T00:00:00");
    if (endDate) lte = new Date(endDate + "T23:59:59");
  }

  const hasRange = !!(gte || lte);
  if (!hasRange) return { hasRange: false, dueOr: null, paymentRange: null };

  const bound = { ...(gte && { gte }), ...(lte && { lte }) };
  return {
    hasRange: true,
    dueOr: [
      { dueDate: bound },
      { dueDate: null, competenceDate: bound },
    ],
    paymentRange: { paymentDate: bound },
  };
}

/** Aplica a janela por VENCIMENTO a um where (AND com o OR de datas). */
export function withDueWindow<T extends Where>(where: T, w: DateWindows): T {
  return (w.dueOr ? { ...where, OR: w.dueOr } : where) as T;
}

/** Aplica a janela por DATA DE PAGAMENTO a um where. */
export function withPaymentWindow<T extends Where>(where: T, w: DateWindows): T {
  return (w.paymentRange ? { ...where, ...w.paymentRange } : where) as T;
}
