// Cria a conta do Juan via Supabase Admin + insere CompanyUser com role EVENTS_ONLY
// Lê service role key direto do .env.local (sem depender de export shell)
const fs = require("fs");
const path = require("path");

function readEnv(key) {
  const raw = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith(key + "=")) return line.slice(key.length + 1);
  }
  return null;
}

const SUPABASE_URL = "https://rqfdslnvojgasynuqbsq.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || readEnv("SUPABASE_SERVICE_ROLE_KEY");

const EMAIL = "juan.santos@coreeducacao.com";
const PASSWORD = "Core12345678@";
const COMPANY_ID = "cmms493rz000013v99n3ti3rx"; // Core Education
const NAME = "Juan Santos";

async function main() {
  if (!SERVICE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");

  // 1. Criar usuário no Supabase Auth (idempotente: se já existe, recupera)
  let userId;
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { name: NAME },
    }),
  });

  if (createRes.ok) {
    const body = await createRes.json();
    userId = body.id;
    console.log("✓ Usuário criado:", userId);
  } else {
    const err = await createRes.text();
    if (/already.*registered|already exists/i.test(err)) {
      // Buscar por email
      const listRes = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(EMAIL)}`,
        { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
      );
      const list = await listRes.json();
      const existing = list.users?.find((u) => u.email === EMAIL);
      if (!existing) throw new Error("Não achou user existente");
      userId = existing.id;
      console.log("ℹ Usuário já existia:", userId);

      // Atualiza senha pra garantir que é a esperada
      const updRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: "PUT",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: PASSWORD, email_confirm: true }),
      });
      if (updRes.ok) console.log("✓ Senha atualizada");
    } else {
      throw new Error("Falha criar user: " + err);
    }
  }

  // 2. Inserir/atualizar CompanyUser via Prisma
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const adapter = new PrismaPg({
    connectionString:
      "postgresql://postgres.rqfdslnvojgasynuqbsq:22756125Fabio02!!@aws-0-us-west-2.pooler.supabase.com:5432/postgres",
    max: 1,
  });
  const prisma = new PrismaClient({ adapter });

  const existingCU = await prisma.companyUser.findUnique({
    where: { companyId_userId: { companyId: COMPANY_ID, userId } },
  });
  if (existingCU) {
    await prisma.companyUser.update({
      where: { id: existingCU.id },
      data: { role: "EVENTS_ONLY", isActive: true, name: NAME, email: EMAIL },
    });
    console.log("✓ CompanyUser atualizado pra EVENTS_ONLY");
  } else {
    await prisma.companyUser.create({
      data: {
        companyId: COMPANY_ID,
        userId,
        name: NAME,
        email: EMAIL,
        role: "EVENTS_ONLY",
        isActive: true,
      },
    });
    console.log("✓ CompanyUser criado com EVENTS_ONLY");
  }

  console.log("\n✅ Pronto! Juan pode logar com:");
  console.log("   Email:", EMAIL);
  console.log("   Senha:", PASSWORD);
  console.log("   Acesso restrito a /eventos");
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error("ERR:", e);
  process.exit(1);
});
