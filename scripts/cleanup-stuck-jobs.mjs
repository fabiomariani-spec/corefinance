import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const result = await prisma.invoiceJob.updateMany({
  where: {
    status: "PROCESSING",
    startedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) }, // > 5 min atrás
  },
  data: {
    status: "ERROR",
    errorMessage: "Background function não executou (deploy antigo). Tente novamente.",
    finishedAt: new Date(),
  },
});
console.log("Jobs marked as ERROR:", result.count);
await prisma.$disconnect();
