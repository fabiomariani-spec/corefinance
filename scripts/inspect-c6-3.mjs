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

// Print page 7 (first FACEBK), then go around the 213k transactions area
console.log("=== Page 7 (first FACEBK) ===");
console.log(pages[6].slice(0, 3000));
console.log("\n=== Page 8 ===");
console.log(pages[7].slice(0, 2000));
