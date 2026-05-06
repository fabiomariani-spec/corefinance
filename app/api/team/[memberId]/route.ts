import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { withAuth } from "@/lib/api-handler";

const ALLOWED_ROLES = ["ADMIN", "MANAGER", "ACCOUNTANT", "VIEWER", "EVENTS_ONLY"] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

// PATCH /api/team/[memberId] — update a member's role
// body: { role }
export const PATCH = withAuth<{ memberId: string }>(async ({ companyId, params, req }) => {
  const auth = await requireAuth();
  const { memberId } = params;
  const { role } = (await req.json()) as { role?: string };

  if (!role || !ALLOWED_ROLES.includes(role as AllowedRole)) {
    return NextResponse.json({ error: "role inválida" }, { status: 400 });
  }

  // Only ADMINs can change roles
  const currentUser = await prisma.companyUser.findFirst({
    where: { companyId, userId: auth.id },
    select: { role: true, userId: true },
  });
  if (currentUser?.role !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores podem alterar permissões" }, { status: 403 });
  }

  const target = await prisma.companyUser.findFirst({
    where: { id: memberId, companyId, isActive: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Membro não encontrado" }, { status: 404 });
  }

  // If demoting an ADMIN (including self), make sure at least one other admin remains
  if (target.role === "ADMIN" && role !== "ADMIN") {
    const adminCount = await prisma.companyUser.count({
      where: { companyId, role: "ADMIN", isActive: true },
    });
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "Não é possível rebaixar o último administrador" },
        { status: 400 }
      );
    }
  }

  const updated = await prisma.companyUser.update({
    where: { id: target.id },
    data: { role: role as AllowedRole },
  });

  return { ok: true, member: { id: updated.id, role: updated.role } };
}, { errorMsg: "Erro ao atualizar permissão" });
