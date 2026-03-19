import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getConnectionString() {
  const raw = process.env.DATABASE_URL!;
  // In production (serverless), force transaction mode pooler (port 6543 + pgbouncer)
  // to avoid "MaxClientsInSessionMode" when multiple functions run concurrently
  if (process.env.NODE_ENV === "production") {
    const url = new URL(raw);
    url.port = "6543";
    url.searchParams.set("pgbouncer", "true");
    return url.toString();
  }
  return raw;
}

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: getConnectionString(),
    max: 1,
  });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
