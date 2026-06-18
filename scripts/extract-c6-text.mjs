// Extrai o texto do PDF exatamente como o claude.ts vê (pagerender com
// disableCombineTextItems + "|" entre items). Salva em /tmp e mostra o resumo.
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { readFileSync, writeFileSync } from "fs";

const path = process.argv[2];
const buf = readFileSync(path);

const pages = [];
await pdfParse(buf, {
  pagerender: async (pageData) => {
    const content = await pageData.getTextContent({
      normalizeWhitespace: false,
      disableCombineTextItems: true,
    });
    const text = content.items.map((it) => it.str + (it.hasEOL ? "\n" : "")).join("|");
    pages.push(text);
    return text;
  },
});

const all = pages.join("\n");
writeFileSync("/tmp/c6-text.txt", all);
console.log("PAGES:", pages.length, "CHARS:", all.length);
console.log("=== linhas com total/pagar/vencimento/fechamento ===");
for (const l of all.split("\n")) {
  if (/total|pagar|vencimento|fechament|saldo|limite/i.test(l)) console.log(l.replace(/\|/g, " ").trim().slice(0, 120));
}
