import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import fs from "node:fs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const card = await prisma.creditCard.findFirst({ select: { id: true, companyId: true, name: true } });
console.log("Cartão:", card.name);

const pdfPath = process.argv[2] || "/Users/joao/Downloads/Bradesco Elias.pdf";
const buf = fs.readFileSync(pdfPath);
const base64 = buf.toString("base64");
console.log(`PDF: ${pdfPath.split("/").pop()} (${(buf.length/1024).toFixed(0)}KB)`);

// Cria job já com o payload (simula o que o upload route faria)
const job = await prisma.invoiceJob.create({
  data: {
    companyId: card.companyId, creditCardId: card.id, status: "PROCESSING",
    payload: base64, mediaType: "application/pdf",
  },
});
console.log("Job criado:", job.id);

// Dispara BG fn com body tiny (só jobId)
const t0 = Date.now();
const res = await fetch("https://finance.corestudio.ai/.netlify/functions/process-invoice-background", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ jobId: job.id }),
});
console.log(`POST → ${res.status} em ${Date.now()-t0}ms`);

for (let i = 0; i < 90; i++) {
  await new Promise(r => setTimeout(r, 3000));
  const j = await prisma.invoiceJob.findUnique({ where: { id: job.id } });
  const el = Math.round((Date.now() - t0) / 1000);
  console.log(`[${el}s] ${j.status} | ${j.errorMessage || "—"}`);
  if (j.status !== "PROCESSING") {
    if (j.status === "READY") {
      const r = j.result;
      console.log("  totalAmount:", r.totalAmount, "items:", r.items.length);
    }
    break;
  }
}

await prisma.$disconnect();
