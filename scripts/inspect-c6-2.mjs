import pdfParse from "pdf-parse/lib/pdf-parse.js";
import fs from "node:fs";

const buf = fs.readFileSync("/Users/joao/Downloads/Fatura Cartão C6 Elias (230373) - 15_unlocked.pdf");

// Page-by-page extraction so we can find which page boundaries
// the section headers fall on (= where chunking goes wrong).
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

console.log("Total pages:", pages.length);

// For each page: first 200 chars + count of "FACEBK" occurrences + last 100 chars
pages.forEach((text, idx) => {
  const page = idx + 1;
  const first = text.slice(0, 150).replace(/\s+/g, " ").trim();
  const facebkCount = (text.match(/FACEBK/gi) || []).length;
  const pagtoCount = (text.match(/inclusao de pagamento|pagamento|pagto/gi) || []).length;
  const headerHints = text.match(/Transações|Lançamento|Pagamento|Parcelad|Próxim|Cartão Virtual|Encargo|Resumo/gi);
  console.log(`P${page.toString().padStart(2)}  FACEBK=${facebkCount.toString().padStart(3)} PAG=${pagtoCount.toString().padStart(2)} | headers: ${(headerHints || []).slice(0, 6).join(", ")} | first: ${first.slice(0, 80)}`);
});
