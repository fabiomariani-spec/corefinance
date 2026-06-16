/**
 * Teste da lógica de janela de datas dos lançamentos.
 * Roda sem framework: `node --experimental-strip-types scripts/test-transaction-filters.ts`
 *
 * Cobre o bug: filtrar "Pagos" + período deve recortar por paymentDate, não dueDate.
 */
import {
  buildDateWindows,
  isRealizedStatusFilter,
  withDueWindow,
  withPaymentWindow,
} from "../lib/transaction-filters.ts";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

console.log("isRealizedStatusFilter:");
check("null → false", isRealizedStatusFilter(null) === false);
check("'' → false", isRealizedStatusFilter("") === false);
check("'all' não é status real → false", isRealizedStatusFilter("all") === false);
check("'PENDING' → false", isRealizedStatusFilter("PENDING") === false);
check("'OVERDUE' → false", isRealizedStatusFilter("OVERDUE") === false);
check("'PREDICTED' → false", isRealizedStatusFilter("PREDICTED") === false);
check("'PAID' → true", isRealizedStatusFilter("PAID") === true);
check("'RECEIVED' → true", isRealizedStatusFilter("RECEIVED") === true);
check("'PAID,RECEIVED' → true", isRealizedStatusFilter("PAID,RECEIVED") === true);
check("'PENDING,OVERDUE' → false (pending payments)", isRealizedStatusFilter("PENDING,OVERDUE") === false);
check("'PAID,PENDING' mistura → false", isRealizedStatusFilter("PAID,PENDING") === false);

console.log("\nbuildDateWindows:");
const none = buildDateWindows({});
check("sem período → hasRange false", none.hasRange === false);
check("sem período → dueOr null", none.dueOr === null);
check("sem período → paymentRange null", none.paymentRange === null);

const jun = buildDateWindows({ startDate: "2026-06-01", endDate: "2026-06-30" });
check("período → hasRange true", jun.hasRange === true);
check("período → dueOr tem 2 ramos (dueDate + fallback competência)", Array.isArray(jun.dueOr) && jun.dueOr.length === 2);
check("dueOr[0] usa dueDate", !!jun.dueOr && "dueDate" in jun.dueOr[0]);
check("dueOr[1] é fallback (dueDate null + competenceDate)", !!jun.dueOr && jun.dueOr[1].dueDate === null && "competenceDate" in jun.dueOr[1]);
check("paymentRange usa paymentDate", !!jun.paymentRange && "paymentDate" in jun.paymentRange);
check("paymentRange.gte = 1 jun 00:00", jun.paymentRange?.paymentDate.gte?.getTime() === new Date("2026-06-01T00:00:00").getTime());
check("paymentRange.lte = 30 jun 23:59:59", jun.paymentRange?.paymentDate.lte?.getTime() === new Date("2026-06-30T23:59:59").getTime());

const onlyStart = buildDateWindows({ startDate: "2026-06-01" });
check("só startDate → gte set, lte undefined", onlyStart.paymentRange?.paymentDate.gte !== undefined && onlyStart.paymentRange?.paymentDate.lte === undefined);

const month = buildDateWindows({ month: "2026-06" });
check("month → gte = 1 jun", month.paymentRange?.paymentDate.gte?.getTime() === new Date(2026, 5, 1).getTime());
check("month → lte = 30 jun 23:59:59", month.paymentRange?.paymentDate.lte?.getTime() === new Date(2026, 5, 30, 23, 59, 59).getTime());

console.log("\nAplicação de janela ao where (cenário do bug):");
// status = PAID + período → recorta por paymentDate, NÃO por dueDate
const paidWhere = withPaymentWindow({ companyId: "c1", type: "EXPENSE", status: "PAID" }, jun);
check("PAID view: where tem paymentDate", "paymentDate" in paidWhere);
check("PAID view: where NÃO tem OR de dueDate", !("OR" in paidWhere));

// status = all/pendentes + período → recorta por dueDate (OR com fallback)
const dueWhere = withDueWindow({ companyId: "c1", type: "EXPENSE" }, jun);
check("due view: where tem OR (dueDate/competência)", "OR" in dueWhere);
check("due view: where NÃO tem paymentDate", !("paymentDate" in dueWhere));

// sem período → nenhuma janela aplicada
const noWindowPaid = withPaymentWindow({ companyId: "c1" }, none);
const noWindowDue = withDueWindow({ companyId: "c1" }, none);
check("sem período: payment não adiciona paymentDate", !("paymentDate" in noWindowPaid));
check("sem período: due não adiciona OR", !("OR" in noWindowDue));

// Regra integrada: a decisão de janela por statusFilter
function pickWhere(statusParam: string | null, base: Record<string, unknown>) {
  const w = buildDateWindows({ startDate: "2026-06-01", endDate: "2026-06-30" });
  return isRealizedStatusFilter(statusParam)
    ? withPaymentWindow(base, w)
    : withDueWindow(base, w);
}
check("integração: status=PAID → paymentDate", "paymentDate" in pickWhere("PAID", { companyId: "c1" }));
check("integração: status=null(all) → OR dueDate", "OR" in pickWhere(null, { companyId: "c1" }));
check("integração: status=PENDING → OR dueDate", "OR" in pickWhere("PENDING", { companyId: "c1" }));
check("integração: status=RECEIVED → paymentDate", "paymentDate" in pickWhere("RECEIVED", { companyId: "c1" }));

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passou, ${failed} falhou`);
process.exit(failed === 0 ? 0 : 1);
