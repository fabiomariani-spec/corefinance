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

  console.log("=== EXTRACAO DO SISTEMA (C6) ===");
  console.log("totalAmount extraido:", result.totalAmount);
  console.log("n items:", result.items.length);
  console.log("soma TODOS os itens:", sumAll.toFixed(2));
  console.log("soma chargedThisMonth:", sumCharged.toFixed(2));
  console.log("referenceMonth:", result.referenceMonth, "| dueDate:", result.dueDate, "| cardLastFour:", result.cardLastFour);
  console.log("diff (chargedThisMonth - totalAmount):", (sumCharged - result.totalAmount).toFixed(2));
}

main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
