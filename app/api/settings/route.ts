import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-handler";
import { requireAuth } from "@/lib/auth";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_CATEGORIES = [
  { name: "Receita Recorrente", type: "INCOME" as const, color: "#10b981" },
  { name: "Receita Avulsa", type: "INCOME" as const, color: "#34d399" },
  { name: "Serviços Prestados", type: "INCOME" as const, color: "#6ee7b7" },
  { name: "Comissões Recebidas", type: "INCOME" as const, color: "#a7f3d0" },
  { name: "Folha de Pagamento", type: "EXPENSE" as const, color: "#ef4444" },
  { name: "Comissões Pagas", type: "EXPENSE" as const, color: "#f87171" },
  { name: "Benefícios", type: "EXPENSE" as const, color: "#fca5a5" },
  { name: "Reembolsos", type: "EXPENSE" as const, color: "#fecaca" },
  { name: "Tráfego Pago", type: "EXPENSE" as const, color: "#f97316" },
  { name: "Agência / Freelancer", type: "EXPENSE" as const, color: "#fb923c" },
  { name: "Ferramentas de Marketing", type: "EXPENSE" as const, color: "#fdba74" },
  { name: "Softwares e SaaS", type: "EXPENSE" as const, color: "#8b5cf6" },
  { name: "Infraestrutura / Cloud", type: "EXPENSE" as const, color: "#a78bfa" },
  { name: "Domínio e Hospedagem", type: "EXPENSE" as const, color: "#c4b5fd" },
  { name: "Aluguel e Imóveis", type: "EXPENSE" as const, color: "#3b82f6" },
  { name: "Serviços de Terceiros", type: "EXPENSE" as const, color: "#60a5fa" },
  { name: "Utilities (Luz, Água, Internet)", type: "EXPENSE" as const, color: "#93c5fd" },
  { name: "Escritório", type: "EXPENSE" as const, color: "#bfdbfe" },
  { name: "Impostos e Taxas", type: "EXPENSE" as const, color: "#ec4899" },
  { name: "Tarifas Bancárias", type: "EXPENSE" as const, color: "#f472b6" },
  { name: "Juros e IOF", type: "EXPENSE" as const, color: "#f9a8d4" },
  { name: "Cartão de Crédito", type: "EXPENSE" as const, color: "#fbcfe8" },
  { name: "Jurídico e Contábil", type: "EXPENSE" as const, color: "#f59e0b" },
  { name: "Viagens e Transporte", type: "EXPENSE" as const, color: "#fbbf24" },
  { name: "Alimentação", type: "EXPENSE" as const, color: "#fcd34d" },
  { name: "Assinaturas", type: "EXPENSE" as const, color: "#fde68a" },
  { name: "Outros", type: "EXPENSE" as const, color: "#6b7280" },
];

const DEFAULT_DEPARTMENTS = [
  { name: "Marketing", code: "MKT", color: "#f97316" },
  { name: "Vendas", code: "VND", color: "#10b981" },
  { name: "Customer Success", code: "CS", color: "#3b82f6" },
  { name: "Tecnologia", code: "TEC", color: "#8b5cf6" },
  { name: "Produto", code: "PRD", color: "#ec4899" },
  { name: "Operações", code: "OPS", color: "#f59e0b" },
  { name: "Administrativo", code: "ADM", color: "#6b7280" },
  { name: "Financeiro", code: "FIN", color: "#14b8a6" },
  { name: "RH", code: "RH", color: "#ef4444" },
  { name: "Diretoria", code: "DIR", color: "#a855f7" },
];

/**
 * Valida CNPJ brasileiro pelos 2 dígitos verificadores.
 * Aceita formatação (XX.XXX.XXX/XXXX-XX) ou só números.
 */
function isValidCnpj(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false; // sequência repetida

  const calc = (slice: string, weights: number[]) => {
    const sum = slice.split("").reduce((acc, n, i) => acc + Number(n) * weights[i], 0);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calc(digits.slice(0, 12), w1);
  const d2 = calc(digits.slice(0, 12) + d1, w2);
  return d1 === Number(digits[12]) && d2 === Number(digits[13]);
}

// ─── GET — busca dados da empresa ativa ──────────────────────────────────────

export const GET = withAuth(async ({ companyId }) => {
  const company = await prisma.company.findFirst({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      document: true,
      email: true,
      phone: true,
      headcount: true,
      currency: true,
      timezone: true,
    },
  });
  if (!company) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
  return company;
}, { errorMsg: "Erro ao buscar configurações" });

// ─── PATCH — atualiza campos da empresa ──────────────────────────────────────

export const PATCH = withAuth(async ({ companyId, req }) => {
  const body = await req.json();

  const allowed: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    allowed.name = body.name.trim();
  }
  if (typeof body.headcount === "number") {
    allowed.headcount = Math.max(0, Math.floor(body.headcount));
  }
  if (typeof body.document === "string") {
    const trimmed = body.document.trim();
    if (trimmed && !isValidCnpj(trimmed)) {
      return NextResponse.json({ error: "CNPJ inválido" }, { status: 400 });
    }
    allowed.document = trimmed || null;
  }
  if (typeof body.email === "string") allowed.email = body.email.trim() || null;
  if (typeof body.phone === "string") allowed.phone = body.phone.trim() || null;
  if (typeof body.currency === "string" && body.currency.trim()) {
    allowed.currency = body.currency.trim().toUpperCase();
  }
  if (typeof body.timezone === "string" && body.timezone.trim()) {
    allowed.timezone = body.timezone.trim();
  }

  return prisma.company.update({
    where: { id: companyId },
    data: allowed,
    select: {
      id: true, name: true, document: true, email: true, phone: true,
      headcount: true, currency: true, timezone: true,
    },
  });
}, { errorMsg: "Erro ao salvar configurações" });

// ─── POST — cria nova empresa (multi-tenant). Usuário vira ADMIN. ────────────

export const POST = withAuth(async ({ req }) => {
  const auth = await requireAuth();
  const body = await req.json();

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Nome da empresa é obrigatório" }, { status: 400 });
  }

  // CNPJ opcional, mas se vier validamos
  let document: string | null = null;
  if (typeof body.document === "string" && body.document.trim()) {
    const trimmed = body.document.trim();
    if (!isValidCnpj(trimmed)) {
      return NextResponse.json({ error: "CNPJ inválido" }, { status: 400 });
    }
    document = trimmed;
  } else if (typeof body.cnpj === "string" && body.cnpj.trim()) {
    // Aceita "cnpj" como alias do "document" pra ergonomia
    const trimmed = body.cnpj.trim();
    if (!isValidCnpj(trimmed)) {
      return NextResponse.json({ error: "CNPJ inválido" }, { status: 400 });
    }
    document = trimmed;
  }

  // Settings opcionais — só currency/timezone por enquanto
  const settings = (body.settings ?? {}) as { currency?: string; timezone?: string };
  const currency = typeof settings.currency === "string" && settings.currency.trim()
    ? settings.currency.trim().toUpperCase()
    : "BRL";
  const timezone = typeof settings.timezone === "string" && settings.timezone.trim()
    ? settings.timezone.trim()
    : "America/Sao_Paulo";

  // CompanyUser tem unique [companyId, userId]. Como criamos uma empresa nova,
  // não há conflito — mas se já tiver alguém com o mesmo email/document, o
  // banco aceita (não tem unique no Company.document por enquanto).

  const company = await prisma.company.create({
    data: {
      name,
      document,
      currency,
      timezone,
      users: {
        create: {
          userId: auth.id,
          name: auth.user_metadata?.name || auth.email || "Administrador",
          email: auth.email || "",
          role: "ADMIN",
        },
      },
      categories: {
        createMany: {
          data: DEFAULT_CATEGORIES.map((c) => ({ ...c, isDefault: true })),
        },
      },
      departments: { createMany: { data: DEFAULT_DEPARTMENTS } },
      accounts: {
        create: {
          name: "Conta Principal",
          type: "CHECKING",
          bank: "Banco Principal",
          color: "#6366f1",
        },
      },
    },
    select: {
      id: true, name: true, document: true, currency: true, timezone: true,
    },
  });

  return NextResponse.json(company, { status: 201 });
}, { errorMsg: "Erro ao criar empresa" });

// ─── DELETE — exclui empresa ativa. Hard-delete (cascade no Prisma). ─────────
//
// Por que hard-delete: a model Company não tem campo isActive nem archivedAt,
// e por convenção deste worktree não fazemos alterações de schema aqui. Em
// compensação, exigimos:
//   1) Usuário ADMIN.
//   2) Não há accounts ATIVOS nem transações.
//   3) Header "x-confirm-name" = name da empresa (dupla confirmação).
//
// Cascade nas FKs (Account/Transaction/Category/etc) já está declarado no
// schema, então o delete cascateia para todos os filhos.

export const DELETE = withAuth(async ({ companyId, req }) => {
  const auth = await requireAuth();

  // 1) Role check
  const currentUser = await prisma.companyUser.findFirst({
    where: { companyId, userId: auth.id, isActive: true },
    select: { role: true },
  });
  if (!currentUser || currentUser.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Apenas administradores podem excluir a empresa" },
      { status: 403 }
    );
  }

  // 2) Carrega empresa pra checar nome e existência
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });
  if (!company) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
  }

  // 3) Validar dados ativos
  const [activeAccounts, txCount] = await Promise.all([
    prisma.account.count({ where: { companyId, isActive: true } }),
    prisma.transaction.count({ where: { companyId } }),
  ]);

  if (activeAccounts > 0 || txCount > 0) {
    return NextResponse.json(
      {
        error: "Empresa tem dados. Remova/arquive primeiro",
        details: {
          accounts: activeAccounts,
          transactions: txCount,
        },
      },
      { status: 409 }
    );
  }

  // 4) Dupla confirmação por nome — pode vir no header ou no body
  let confirmName = req.headers.get("x-confirm-name");
  if (!confirmName) {
    try {
      const body = await req.json();
      if (typeof body?.confirmName === "string") confirmName = body.confirmName;
    } catch {
      // body opcional — sem JSON é ok
    }
  }

  if (!confirmName || confirmName.trim() !== company.name) {
    return NextResponse.json(
      { error: 'Confirmação inválida — digite o nome exato da empresa' },
      { status: 400 }
    );
  }

  // 5) Hard-delete — cascade trata Account/Transaction/Category/etc
  await prisma.company.delete({ where: { id: companyId } });

  return { ok: true };
}, { errorMsg: "Erro ao excluir empresa" });
