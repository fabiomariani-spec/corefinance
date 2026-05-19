import pdfParse from "pdf-parse/lib/pdf-parse.js";
import fs from "node:fs";

const buf = fs.readFileSync("/Users/joao/Downloads/Fatura Cartão C6 Elias (230373) - 15_unlocked.pdf");

const pages = [];
await pdfParse(buf, {
  pagerender: async (pageData) => {
    const content = await pageData.getTextContent({
      normalizeWhitespace: false,
      disableCombineTextItems: false,
    });
    const text = content.items.map((it) => it.str + (it.hasEOL ? "\n" : "")).join("");
    pages.push(text);
    return text;
  },
});

// Find all candidate "summary" lines: things like "Total de novos lançamentos",
// "Total parcelas", "Resumo da fatura", section totals.
console.log("=== LINHAS COM 'TOTAL', 'SUBTOTAL', 'RESUMO', 'ENCARGOS' ===\n");
pages.forEach((text, idx) => {
  const lines = text.split("\n");
  lines.forEach((l, lineIdx) => {
    if (/total|subtotal|sub-total|resumo|encargo|tarifa|iof|crédito|cashback|estorno|anuidade/i.test(l)
        && /\d/.test(l)
        && l.length < 200) {
      console.log(`P${(idx+1).toString().padStart(2)} L${lineIdx}: ${l.trim().slice(0, 150)}`);
    }
  });
});

// Also: identify any line that looks like a section break.
console.log("\n\n=== POSSÍVEIS HEADERS DE SEÇÃO (linhas curtas sem números) ===\n");
pages.forEach((text, idx) => {
  const lines = text.split("\n");
  lines.forEach((l, lineIdx) => {
    const stripped = l.trim();
    if (stripped.length > 4 && stripped.length < 70 && !/\d/.test(stripped) && /[a-z]/.test(stripped)) {
      if (/lançament|transaç|compra|parcel|próxim|pagamento|cartão|virtual|adicional|encargo|crédito|cashback/i.test(stripped)) {
        console.log(`P${(idx+1).toString().padStart(2)} L${lineIdx}: ${stripped}`);
      }
    }
  });
});
