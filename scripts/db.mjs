// Cliente direto pro Postgres do Supabase (via pooler us-west-2).
// Uso: node scripts/db.mjs "SELECT 1"
//      cat arquivo.sql | node scripts/db.mjs
import pg from "pg";
import { readFileSync } from "fs";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL não setada"); process.exit(1); }

const sql = process.argv[2] ?? readFileSync(0, "utf-8");

// URL parsing manual pra evitar bug do pg que trunca user em "."
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
try {
  const r = await c.query(sql);
  if (Array.isArray(r)) {
    for (const x of r) console.log(JSON.stringify(x.rows ?? { ok: x.command, rows: x.rowCount }, null, 2));
  } else {
    console.log(JSON.stringify(r.rows ?? { ok: r.command, rows: r.rowCount }, null, 2));
  }
} finally { await c.end(); }
