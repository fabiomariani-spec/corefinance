import pg from "pg";
import { writeFileSync } from "fs";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL não setada"); process.exit(1); }

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

const sql = `
WITH dup AS (
  SELECT
    id,
    description,
    amount::text AS amount,
    "competenceDate"::date::text AS competence,
    "creditCardId",
    "importedFromInvoiceId" AS invoice_id,
    "createdAt"::text AS created_at,
    status,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(TRIM(description)), amount, "competenceDate"::date, "creditCardId"
      ORDER BY "createdAt", id
    ) AS rn,
    COUNT(*) OVER (
      PARTITION BY LOWER(TRIM(description)), amount, "competenceDate"::date, "creditCardId"
    ) AS group_size
  FROM transactions
  WHERE "companyId" = 'cmms493rz000013v99n3ti3rx'
    AND "importSource" = 'invoice_import'
)
SELECT id, description, amount, competence, "creditCardId", invoice_id, created_at, status, rn, group_size
FROM dup
WHERE group_size > 1
ORDER BY description, amount, competence, created_at;
`;
const r = await c.query(sql);
await c.end();

const csvEsc = (v) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

const header = [
  "id","description","amount","competence","creditCardId","invoice_id","created_at","status","rn","group_size","action",
];
const lines = [header.join(",")];
for (const row of r.rows) {
  const rn = Number(row.rn);
  const action = rn === 1 ? "manter" : "remover";
  lines.push([
    row.id, row.description, row.amount, row.competence, row.creditCardId, row.invoice_id,
    row.created_at, row.status, row.rn, row.group_size, action,
  ].map(csvEsc).join(","));
}
writeFileSync("/tmp/dupes/pagamentos_duplicados.csv", lines.join("\n") + "\n");

const grupos = new Set();
let manter = 0;
let remover = 0;
for (const row of r.rows) {
  grupos.add(`${row.description}|${row.amount}|${row.competence}|${row.creditCardId}`);
  if (Number(row.rn) === 1) manter++; else remover++;
}
console.log(JSON.stringify({
  total_linhas_em_grupos_duplicados: r.rows.length,
  grupos: grupos.size,
  manter,
  remover,
}, null, 2));
