#!/usr/bin/env node
// E2E test do extrator de fatura. Roda direto contra Anthropic, sem app/db.
// Uso: node scripts/test-faturas.mjs <pdf...>
//
// Pra cada PDF: mostra page count, items extraídos, totalAmount, soma dos
// chargedThisMonth=true, divergência %, e flag se vai disparar fallback no UI.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Falta ANTHROPIC_API_KEY no .env.local");
  process.exit(1);
}

// Import compiled extractor. tsx executa TS direto.
const { extractInvoiceFromFile } = await import("../lib/claude.ts");

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Uso: tsx scripts/test-faturas.mjs <pdf...>");
  process.exit(1);
}

const fmt = (n) => (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (n) => (n * 100).toFixed(2) + "%";

for (const file of files) {
  const name = path.basename(file);
  console.log("\n" + "=".repeat(80));
  console.log("📄 " + name);
  console.log("=".repeat(80));

  const buf = fs.readFileSync(file);
  const base64 = buf.toString("base64");
  const mediaType = "application/pdf";

  const t0 = Date.now();
  let result;
  try {
    result = await extractInvoiceFromFile(base64, mediaType);
  } catch (err) {
    console.error("❌ Falhou:", err.message);
    continue;
  }
  const dt = ((Date.now() - t0) / 1000).toFixed(1);

  const total = result.totalAmount;
  const items = result.items;
  const charged = items.filter((i) => i.chargedThisMonth ?? true);
  const sumCharged = charged.reduce((s, i) => s + i.amount, 0);
  const sumAll = items.reduce((s, i) => s + i.amount, 0);
  const diff = Math.abs(sumCharged - total);
  const diffPct = total > 0 ? diff / total : 0;
  const aiFailed = diffPct > 0.05;

  console.log(`⏱  ${dt}s`);
  console.log(`💰 Total da fatura:        ${fmt(total)}`);
  console.log(`📋 Itens extraídos:        ${items.length}`);
  console.log(`✅ Marcados deste mês:     ${charged.length} (${fmt(sumCharged)})`);
  console.log(`📅 Marcados futuros:       ${items.length - charged.length} (${fmt(sumAll - sumCharged)})`);
  console.log(`📊 Divergência:            ${fmt(diff)} (${pct(diffPct)})`);
  console.log(`🚦 UI vai mostrar fallback: ${aiFailed ? "SIM ❌" : "NÃO ✅"}`);

  // Breakdown por seção
  const sectionMap = new Map();
  for (const it of items) {
    const key = it.section ?? "(sem seção)";
    const cur = sectionMap.get(key) ?? { count: 0, sum: 0, charged: it.chargedThisMonth };
    cur.count++;
    cur.sum += it.amount;
    sectionMap.set(key, cur);
  }
  console.log("\n📑 Seções identificadas pela IA:");
  const sortedSections = [...sectionMap.entries()].sort((a, b) => Math.abs(b[1].sum) - Math.abs(a[1].sum));
  for (const [name, info] of sortedSections) {
    const flag = info.charged ? "✅ ENTRA" : "❌ NÃO ENTRA";
    console.log(`   ${flag.padEnd(12)} ${info.count.toString().padStart(4)} itens · ${fmt(info.sum).padStart(16)} · ${name}`);
  }

  if (aiFailed) {
    console.log("\n🔎 Top 5 itens marcados como 'deste mês' (verifique se a seção é coerente):");
    const top = [...charged].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 5);
    top.forEach((it) => {
      const sec = (it.section ?? "?").slice(0, 30);
      console.log(`   ${fmt(it.amount).padStart(14)}  [${sec.padEnd(30)}] ${it.description.slice(0, 40)}`);
    });
  }
}

console.log("\n" + "=".repeat(80));
