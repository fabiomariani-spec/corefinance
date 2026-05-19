import pdfParse from "pdf-parse/lib/pdf-parse.js";
import fs from "node:fs";

const buf = fs.readFileSync("/Users/joao/Downloads/Fatura Cartão C6 Elias (230373) - 15_unlocked.pdf");

// Testar com disableCombineTextItems: true (separa items)
const pagesSeparated = [];
await pdfParse(buf, {
  pagerender: async (pageData) => {
    const content = await pageData.getTextContent({
      normalizeWhitespace: false,
      disableCombineTextItems: true,
    });
    const text = content.items.map((it) => it.str + (it.hasEOL ? "\n" : "")).join("|");
    pagesSeparated.push(text);
    return text;
  },
});

console.log("=== Page 7 com disableCombineTextItems: true ===");
console.log(pagesSeparated[6].slice(0, 3000));
