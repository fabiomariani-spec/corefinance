import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import fs from "node:fs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Pega um companyId e creditCardId reais (de qualquer cartão do banco)
const card = await prisma.creditCard.findFirst({ select: { id: true, companyId: true, name: true } });
if (!card) { console.error("Nenhum cartão encontrado"); process.exit(1); }
console.log("Usando cartão:", card.name, "company:", card.companyId);

// Cria job de teste
const job = await prisma.invoiceJob.create({
  data: { companyId: card.companyId, creditCardId: card.id, status: "PROCESSING" },
});
console.log("Job criado:", job.id);

// Lê PDF
const pdfPath = "/Users/joao/Downloads/Bradesco Elias.pdf";
const buf = fs.readFileSync(pdfPath);
const base64 = buf.toString("base64");
console.log(`PDF: ${pdfPath} (${(buf.length / 1024).toFixed(0)}KB → ${(base64.length / 1024).toFixed(0)}KB base64)`);

// Dispara background function
const t0 = Date.now();
const res = await fetch("https://finance.corestudio.ai/.netlify/functions/process-invoice-background", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jobId: job.id, companyId: card.companyId, creditCardId: card.id,
    base64, mediaType: "application/pdf",
  }),
});
console.log(`POST → ${res.status} em ${Date.now() - t0}ms`);

// Polling
for (let i = 0; i < 60; i++) {
  await new Promise(r => setTimeout(r, 3000));
  const refreshed = await prisma.invoiceJob.findUnique({ where: { id: job.id }});
  const elapsed = Math.round((Date.now() - t0) / 1000);
  console.log(`[${elapsed}s] status=${refreshed.status}${refreshed.errorMessage ? ` error="${refreshed.errorMessage}"` : ""}`);
  if (refreshed.status !== "PROCESSING") {
    if (refreshed.status === "READY") {
      const r = refreshed.result;
      console.log("  totalAmount:", r.totalAmount, "| items:", r.items.length);
    }
    break;
  }
}

await prisma.$disconnect();
