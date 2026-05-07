import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getConnectionString() {
  let raw = process.env.DATABASE_URL!;
  // Defesa: o projeto Supabase foi movido de sa-east-1 → us-west-2. Se a
  // env (Netlify) ainda apontar pra região antiga, reescreve no boot. Evita
  // ter que pedir pro owner da Netlify atualizar manualmente.
  raw = raw.replace("aws-0-sa-east-1.pooler.supabase.com", "aws-0-us-west-2.pooler.supabase.com");

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
    // keepAlive: TCP keepalive evita o pooler dropar conexão entre invocações
    // do mesmo container Lambda. Reduz reconnect cost em warm starts.
    keepAlive: true,
    // idle timeout maior — pgbouncer aguenta, e a função vive ~5min ociosa
    // antes de o Lambda reciclar
    idleTimeoutMillis: 30_000,
    // connection timeout curto pra falhar rápido em vez de esperar 30s
    connectionTimeoutMillis: 10_000,
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

// Reusa o client em TODAS as envs (incluindo produção). Em Lambda warm,
// isso elimina o overhead de criar adapter+client a cada invocação
// (~50-100ms economizados em warm starts).
export const prisma = globalForPrisma.prisma ?? createPrismaClient();
globalForPrisma.prisma = prisma;
