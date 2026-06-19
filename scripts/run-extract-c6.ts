import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { extractInvoiceFromFile } from "../lib/claude";

async function main() {
  const path = process.argv[2];
  const base64 = readFileSync(path).toString("base64");

  const result = await extractInvoiceFromFile(base64, "application/pdf");
  writeFileSync("/tmp/c6-extract.json", JSON.stringify(result, null, 2));

  const sumAll = result.items.reduce((s, it) => s + it.amount, 0);
  const sumCharged = result.items
    .filter((it) => it.chargedThisMonth !== false)
    .reduce((s, it) => s + it.amount, 0);
  // Conciliação por compras: só débitos do mês (amount>0, charged).
  const sumPurchases = result.items
    .filter((it) => it.chargedThisMonth !== false && it.amount > 0)
    .reduce((s, it) => s + it.amount, 0);

  console.log("=== EXTRACAO DO SISTEMA ===");
  console.log("totalAmount (total a pagar):", result.totalAmount);
  console.log("n items:", result.items.length);
  console.log("soma TODOS os itens:", sumAll.toFixed(2));
  console.log("soma chargedThisMonth:", sumCharged.toFixed(2));
  console.log("soma COMPRAS do mês (amount>0, charged):", sumPurchases.toFixed(2));
  console.log("referenceMonth:", result.referenceMonth, "| dueDate:", result.dueDate, "| cardLastFour:", result.cardLastFour);

  console.log("\n=== RESUMO DA FATURA (summary) ===");
  if (result.summary) {
    const f = (n: number | null) => (n === null ? "—" : n.toFixed(2));
    console.log("saldo anterior   :", f(result.summary.previousBalance));
    console.log("(+) compras/déb. :", f(result.summary.purchasesDebits));
    console.log("(-) créd./pagtos :", f(result.summary.paymentsCredits));
    console.log("(=) total a pagar:", f(result.summary.totalToPay));
    if (result.summary.purchasesDebits != null) {
      const diffPur = sumPurchases - result.summary.purchasesDebits;
      console.log("\nCONCILIAÇÃO por compras (soma compras - purchasesDebits):", diffPur.toFixed(2), Math.abs(diffPur) <= 0.01 ? "✅ FECHA" : "❌ DIVERGE");
    }
  } else {
    console.log("(sem bloco de resumo)");
  }

  // Itens marcados como pagamento (não devem virar lançamento)
  const pagamentos = result.items.filter((it) => it.section === "Pagamentos efetuados");
  if (pagamentos.length) {
    console.log("\n=== PAGAMENTOS/ADIANTAMENTOS (não viram lançamento) ===");
    for (const p of pagamentos) console.log(` ${p.amount.toFixed(2)} | ${p.description} | charged=${p.chargedThisMonth}`);
  }
}

main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
