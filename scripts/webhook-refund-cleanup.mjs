// Limpeza + migração do webhook de receita (2026-08-19).
//
// 1) Backup JSON dos lançamentos afetados (untracked, não commitar)
// 2) OCULTA (status=CANCELLED, não apaga — padrão combinado com o João):
//    - 3 testes "Produto de Teste - Webhook" (R$ 97) criados pelos payloads
//      REFUNDED/CANCELLED da OnProfit que o handler antigo gravou como PENDING
//    - 1 duplicata do order_1366755 (R$ 32.000, webhook recebido 2x em 22ms)
// 3) Adiciona coluna transactions.externalId + índice único (companyId, externalId)
// 4) Backfill externalId a partir da tag "ext:order_<id>"
//
// Idempotente. Rodar: node --env-file=.env.local scripts/webhook-refund-cleanup.mjs [--apply]

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { writeFileSync, existsSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const COMPANY = "cmms493rz000013v99n3ti3rx";
const TODAY = "19/08/2026";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_IDS = ["cmt07sayw000209jr58cuzfnf", "cmt07s26h000109jr7t2apffm", "cmt07qze3000009jr85zd02kv"];
const DUP_KEEP = "cmsyv0vps000109l7ui9o2dza"; // o primeiro criado (19:11:14.704)
const DUP_CANCEL = "cmsyv0vqe000109lgaumm5duy"; // o segundo (19:11:14.726)

async function main() {
  // 0) coluna precisa existir antes de qualquer query do Prisma Client (o client
  //    gerado já a conhece). ADD COLUMN IF NOT EXISTS é inofensivo em dry-run.
  await prisma.$executeRawUnsafe(`ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "externalId" TEXT`);

  const ids = [...TEST_IDS, DUP_KEEP, DUP_CANCEL];
  const rows = await prisma.transaction.findMany({ where: { id: { in: ids }, companyId: COMPANY } });
  if (rows.length !== ids.length) {
    throw new Error(`Esperava ${ids.length} lançamentos, achei ${rows.length}: ${rows.map((r) => r.id).join(",")}`);
  }
  for (const r of rows) {
    console.log(`${r.id} | ${r.description} | ${r.amount} | ${r.status} | tags=${r.tags.join(",")}`);
  }

  const backupPath = "backup-webhook-refund-2026-08-19.json";
  if (!existsSync(backupPath)) {
    writeFileSync(backupPath, JSON.stringify(rows, (_, v) => (typeof v === "bigint" ? String(v) : v), 2));
    console.log(`backup salvo em ${backupPath}`);
  } else {
    console.log(`backup já existe em ${backupPath} (mantido)`);
  }

  if (!APPLY) {
    console.log("\n(dry-run) passe --apply para executar");
    return;
  }

  // 2a) testes → CANCELLED
  let testCount = 0;
  for (const id of TEST_IDS) {
    const r = rows.find((x) => x.id === id);
    if (r.status === "CANCELLED") continue;
    await prisma.transaction.update({
      where: { id },
      data: {
        status: "CANCELLED",
        paymentDate: null,
        notes: `${r.notes ?? ""} | Teste de webhook OnProfit (status REFUNDED/CANCELLED) gravado como receita pelo handler antigo — ocultado em ${TODAY}`.replace(/^ \| /, ""),
      },
    });
    testCount++;
  }
  console.log(`testes cancelados: ${testCount}`);

  // 2b) duplicata → CANCELLED, sem a tag ext: (libera o índice único pro original)
  const dup = rows.find((x) => x.id === DUP_CANCEL);
  await prisma.transaction.update({
    where: { id: DUP_CANCEL },
    data: {
      status: "CANCELLED",
      paymentDate: null,
      tags: dup.tags.map((t) => (t.startsWith("ext:") ? t.replace(/^ext:/, "dup:") : t)),
      notes: `${dup.notes ?? ""} | Duplicata do webhook (pedido 1366755 recebido 2x em 22ms; original ${DUP_KEEP}) — ocultada em ${TODAY}`.replace(/^ \| /, ""),
    },
  });
  console.log(`duplicata cancelada: ${DUP_CANCEL}`);

  // 3) índice único (só depois de tirar a tag ext: da duplicata)
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "transactions_companyId_externalId_key" ON "transactions"("companyId", "externalId")`,
  );
  console.log("índice único (companyId, externalId) ok");

  // 4) backfill a partir das tags ext:
  const filled = await prisma.$executeRawUnsafe(`
    UPDATE "transactions" t
       SET "externalId" = sub.ext
      FROM (
        SELECT id, substring(tag from 5) AS ext
          FROM "transactions", unnest(tags) AS tag
         WHERE tag LIKE 'ext:%'
      ) sub
     WHERE t.id = sub.id AND t."externalId" IS NULL
  `);
  console.log(`backfill externalId: ${filled} linhas`);

  const check = await prisma.$queryRawUnsafe(`
    SELECT count(*)::int AS com_tag,
           count(*) FILTER (WHERE "externalId" IS NOT NULL)::int AS com_external_id
      FROM "transactions"
     WHERE EXISTS (SELECT 1 FROM unnest(tags) tg WHERE tg LIKE 'ext:%')
  `);
  console.log("verificação:", check);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
