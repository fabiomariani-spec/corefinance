import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const job = await prisma.invoiceJob.findFirst({
  where: { status: "READY" },
  orderBy: { createdAt: "desc" },
});

console.log("Job:", job.id, "criado", job.createdAt.toISOString());
const r = job.result;
console.log("Total da fatura:", r.totalAmount);
console.log("Items extraídos:", r.items.length);

// Sections breakdown
const sections = new Map();
for (const it of r.items) {
  const s = it.section ?? "(sem)";
  const cur = sections.get(s) ?? { count: 0, sum: 0, charged: it.chargedThisMonth };
  cur.count++;
  cur.sum += it.amount;
  sections.set(s, cur);
}
console.log("\nSeções:");
for (const [name, info] of [...sections.entries()].sort((a,b) => Math.abs(b[1].sum) - Math.abs(a[1].sum))) {
  console.log(`  ${info.charged ? "✅ ENTRA":"❌ NÃO ENTRA"} | ${info.count.toString().padStart(4)} itens | ${info.sum.toFixed(2).padStart(12)} | ${name}`);
}

// Searching for pagamento-related items
console.log("\nItens com 'pagamento' / 'pagto' / 'antecip' na descrição:");
for (const it of r.items) {
  if (/pagamento|pagto|antecip|estorno|cr[eé]dito/i.test(it.description)) {
    console.log(`  ${it.amount.toFixed(2).padStart(12)} | section="${it.section}" | charged=${it.chargedThisMonth} | "${it.description}"`);
  }
}

await prisma.$disconnect();
