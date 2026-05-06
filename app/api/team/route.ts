import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { withAuth } from "@/lib/api-handler";

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
