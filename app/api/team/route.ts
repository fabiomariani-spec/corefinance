import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { withAuth } from "@/lib/api-handler";
import { findAuthUserByEmail } from "@/lib/supabase/admin";
import { addDays } from "date-fns";
import type { UserRole } from "@prisma/client";

const ALLOWED_ROLES: UserRole[] = ["ADMIN", "MANAGER", "ACCOUNTANT", "VIEWER", "EVENTS_ONLY"];

// GET /api/team — list members + pending invites + current user role
export const GET = withAuth(async ({ companyId }) => {
  const auth = await requireAuth();

  const [members, invites, currentUser] = await Promise.all([
    prisma.companyUser.findMany({
      where: { companyId, isActive: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invite.findMany({
      where: { companyId, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.companyUser.findFirst({
      where: { companyId, userId: auth.id },
      select: { role: true },
    }),
  ]);

  return {
    members: members.map((m) => ({
      ...m,
      isCurrentUser: m.userId === auth.id,
    })),
    invites,
    currentUserRole: currentUser?.role ?? "VIEWER",
  };
}, { errorMsg: "Erro ao buscar equipe" });

// POST /api/team — add a member directly by email
// body: { email, role }
// - 200 + { member }                → usuário já existia em Auth, virou CompanyUser
// - 202 + { invited: true, token }  → usuário não existe em Auth, criamos um convite
// - 409                              → e-mail já é membro ativo
// - 403                              → sem permissão (não-ADMIN)
// - 400                              → payload inválido
export const POST = withAuth(async ({ companyId, req }) => {
  const auth = await requireAuth();
  const body = (await req.json().catch(() => ({}))) as { email?: string; role?: string };
  const email = body.email?.trim().toLowerCase();
  const role = body.role as UserRole | undefined;

  if (!email || !role) {
    return NextResponse.json({ error: "email e role obrigatórios" }, { status: 400 });
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: "role inválida" }, { status: 400 });
  }

  // RBAC: apenas ADMIN pode adicionar membros
  const currentUser = await prisma.companyUser.findFirst({
    where: { companyId, userId: auth.id },
    select: { role: true, name: true },
  });
  if (currentUser?.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Apenas administradores podem adicionar membros" },
      { status: 403 }
    );
  }

  // Conflito: e-mail já é membro ativo
  const existingActive = await prisma.companyUser.findFirst({
    where: { companyId, email, isActive: true },
  });
  if (existingActive) {
    return NextResponse.json({ error: "Este e-mail já é membro da equipe" }, { status: 409 });
  }

  // Procura o usuário no Supabase Auth via service role
  const authUser = await findAuthUserByEmail(email);

  // Caminho A — usuário não existe em Auth: cai pro fluxo de convite
  if (!authUser) {
    // Revoga convites pendentes anteriores pro mesmo e-mail (mesma lógica do
    // POST /api/team/invite, pra evitar duplicatas)
    await prisma.invite.updateMany({
      where: { companyId, email, usedAt: null },
      data: { expiresAt: new Date() },
    });

    const invite = await prisma.invite.create({
      data: {
        companyId,
        email,
        role,
        invitedBy: currentUser?.name ?? "Administrador",
        expiresAt: addDays(new Date(), 7),
      },
    });

    return NextResponse.json(
      { invited: true, token: invite.token, message: "Usuário ainda não cadastrado — convite gerado." },
      { status: 202 }
    );
  }

  // Caminho B — usuário existe em Auth: cria/reativa CompanyUser direto
  const existingLink = await prisma.companyUser.findFirst({
    where: { companyId, userId: authUser.id },
  });

  if (existingLink?.isActive) {
    return NextResponse.json({ error: "Este usuário já é membro da equipe" }, { status: 409 });
  }

  const displayName = authUser.name ?? authUser.email.split("@")[0];

  const member = existingLink
    ? await prisma.companyUser.update({
        where: { id: existingLink.id },
        data: { isActive: true, role, name: displayName, email: authUser.email },
      })
    : await prisma.companyUser.create({
        data: {
          companyId,
          userId: authUser.id,
          role,
          name: displayName,
          email: authUser.email,
        },
      });

  return NextResponse.json({ ok: true, member });
}, { errorMsg: "Erro ao adicionar membro" });

// DELETE /api/team — remove a member (body: { userId })
export const DELETE = withAuth(async ({ companyId, req }) => {
  const auth = await requireAuth();
  const { userId } = await req.json();

  if (!userId) {
    return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });
  }

  // Cannot remove self
  if (userId === auth.id) {
    return NextResponse.json({ error: "Você não pode remover a si mesmo" }, { status: 400 });
  }

  // Only ADMINs can remove members
  const currentUser = await prisma.companyUser.findFirst({
    where: { companyId, userId: auth.id },
  });
  if (currentUser?.role !== "ADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Soft-delete: deactivate
  await prisma.companyUser.updateMany({
    where: { companyId, userId },
    data: { isActive: false },
  });

  return { ok: true };
}, { errorMsg: "Erro ao remover membro" });
