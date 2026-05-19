import pdfParse from "pdf-parse/lib/pdf-parse.js";
import fs from "node:fs";

const buf = fs.readFileSync("/Users/joao/Downloads/Fatura Cartão C6 Elias (230373) - 15_unlocked.pdf");
const result = await pdfParse(buf);
console.log("PAGES:", result.numpages);

// Print the lines with FACEBK 2L8E3 to find where the 280k value comes from
const lines = result.text.split("\n");
const matches = lines
  .map((line, i) => ({ line, i }))
  .filter(({ line }) => /2L8E3|280\.586|280586|FACEBK.+213\.|FACEBK.+285\.|inclusao de pagamento/i.test(line));

console.log("\n=== Linhas relevantes ===");
for (const { line, i } of matches.slice(0, 20)) {
  console.log(`[${i}] ${line}`);
}

console.log("\n=== Headers de seção encontrados ===");
const sectionHeaders = lines.filter((l) =>
  /transações|lançamento|próxim|parcelad|pagamento|encargo|crédito|cashback|virtual|cartão final/i.test(l)
  && l.length < 100
);
for (const h of sectionHeaders.slice(0, 30)) {
  console.log(h);
}
