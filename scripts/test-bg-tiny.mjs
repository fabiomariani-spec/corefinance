import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const card = await prisma.creditCard.findFirst({ select: { id: true, companyId: true } });
const job = await prisma.invoiceJob.create({
  data: { companyId: card.companyId, creditCardId: card.id, status: "PROCESSING" },
});
console.log("Job criado:", job.id);

// Payload mínimo — base64 vazio. Se a função registrar "1/4 payload recebido"
// e morrer no passo 2 ou 3, confirmamos que o problema é só na chamada da IA.
const res = await fetch("https://finance.corestudio.ai/.netlify/functions/process-invoice-background", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jobId: job.id, companyId: card.companyId, creditCardId: card.id,
    base64: "", mediaType: "application/pdf",
  }),
});
console.log("POST →", res.status);

for (let i = 0; i < 30; i++) {
  await new Promise(r => setTimeout(r, 2000));
  const j = await prisma.invoiceJob.findUnique({ where: { id: job.id } });
  console.log(`[${(i+1)*2}s] status=${j.status} | msg=${j.errorMessage}`);
  if (j.status !== "PROCESSING") break;
}

await prisma.$disconnect();
