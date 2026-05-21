import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const job = await prisma.invoiceJob.findFirst({
  where: { status: "READY" },
  orderBy: { createdAt: "desc" },
});

const items = job.result.items;
console.log("Itens com valor entre R$ 80k e R$ 100k:");
for (const it of items) {
  if (Math.abs(it.amount) >= 80000 && Math.abs(it.amount) <= 100000) {
    console.log(`  ${it.amount.toFixed(2).padStart(12)} | section="${it.section}" | charged=${it.chargedThisMonth} | "${it.description.slice(0,60)}"`);
  }
}

await prisma.$disconnect();
