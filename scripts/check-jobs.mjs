import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const jobs = await prisma.invoiceJob.findMany({
  orderBy: { createdAt: "desc" },
  take: 10,
  select: {
    id: true,
    status: true,
    errorMessage: true,
    startedAt: true,
    finishedAt: true,
    createdAt: true,
    companyId: true,
    creditCardId: true,
  },
});

console.log(`Total recent jobs: ${jobs.length}`);
for (const j of jobs) {
  const elapsed = j.finishedAt
    ? `${Math.round((j.finishedAt - j.startedAt) / 1000)}s`
    : `${Math.round((Date.now() - j.startedAt) / 1000)}s (em andamento)`;
  console.log(`${j.id} | ${j.status.padEnd(11)} | ${j.createdAt.toISOString()} | ${elapsed}`);
  if (j.errorMessage) console.log(`  msg: ${j.errorMessage}`);
}

await prisma.$disconnect();
