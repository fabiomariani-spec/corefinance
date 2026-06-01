import pg from "pg";
import { writeFileSync } from "fs";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL não setada"); process.exit(1); }

const APPLY = process.argv.includes("--apply");
const COMPANY_ID = "cmms493rz000013v99n3ti3rx";

const u = new URL(url);
const c = new pg.Client({
  host: u.hostname,
  port: parseInt(u.port || "5432"),
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: u.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});
await c.connect();

await c.query("BEGIN");

try {
  const targets = await c.query(
    `WITH dup AS (
       SELECT *, ROW_NUMBER() OVER (
         PARTITION BY LOWER(TRIM(description)), amount, "competenceDate"::date, "creditCardId"
         ORDER BY "createdAt", id
       ) AS rn
       FROM transactions
       WHERE "companyId" = $1
         AND "importSource" = 'invoice_import'
     )
     SELECT * FROM dup WHERE rn > 1
     ORDER BY description, amount, "competenceDate", "createdAt"`,
    [COMPANY_ID],
  );

  const ids = targets.rows.map((r) => r.id);
  console.log(`Alvos: ${ids.length}`);

  if (ids.length === 0) {
    console.log("Nada pra remover.");
    await c.query("ROLLBACK");
    process.exit(0);
  }

  const refAttachments = await c.query(
    `SELECT COUNT(*)::int AS n FROM attachments WHERE "transactionId" = ANY($1)`,
    [ids],
  );
  const refInvoiceItems = await c.query(
    `SELECT COUNT(*)::int AS n FROM invoice_items WHERE "transactionId" = ANY($1)`,
    [ids],
  );
  const refEventItems = await c.query(
    `SELECT COUNT(*)::int AS n FROM event_items WHERE "transactionId" = ANY($1)`,
    [ids],
  );
  console.log(`Refs em attachments=${refAttachments.rows[0].n} invoice_items=${refInvoiceItems.rows[0].n} event_items=${refEventItems.rows[0].n}`);

  writeFileSync("/tmp/dupes/backup-transactions.json", JSON.stringify(targets.rows, null, 2));
  console.log(`Backup salvo em /tmp/dupes/backup-transactions.json (${targets.rows.length} linhas).`);

  const sum = targets.rows.reduce((acc, r) => acc + Number(r.amount), 0);
  console.log(`Soma dos valores alvo: R$ ${sum.toFixed(2)}`);

  if (!APPLY) {
    console.log("DRY-RUN — passa --apply pra deletar de verdade.");
    await c.query("ROLLBACK");
    process.exit(0);
  }

  const del = await c.query(`DELETE FROM transactions WHERE id = ANY($1)`, [ids]);
  console.log(`Deletadas: ${del.rowCount}`);

  const left = await c.query(
    `WITH dup AS (
       SELECT id, ROW_NUMBER() OVER (
         PARTITION BY LOWER(TRIM(description)), amount, "competenceDate"::date, "creditCardId"
         ORDER BY "createdAt", id
       ) AS rn
       FROM transactions
       WHERE "companyId" = $1
         AND "importSource" = 'invoice_import'
     )
     SELECT COUNT(*)::int AS extras FROM dup WHERE rn > 1`,
    [COMPANY_ID],
  );
  console.log(`Duplicatas restantes (invoice_import): ${left.rows[0].extras}`);

  await c.query("COMMIT");
  console.log("COMMIT ok.");
} catch (e) {
  await c.query("ROLLBACK");
  console.error("ROLLBACK:", e.message);
  process.exit(1);
} finally {
  await c.end();
}
