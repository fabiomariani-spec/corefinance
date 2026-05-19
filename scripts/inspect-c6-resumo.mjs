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

// Print pages 1-5 fully (summary pages)
for (let p = 0; p < 5; p++) {
  console.log(`\n========== PAGE ${p+1} ==========`);
  console.log(pages[p]);
}
