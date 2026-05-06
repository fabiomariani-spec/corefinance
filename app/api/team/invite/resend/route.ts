import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { withAuth } from "@/lib/api-handler";
import { addDays } from "date-fns";

// POST /api/team/invite/resend — revoke old invite + create a fresh one
// body: { inviteId }
export const POST = withAuth(async ({ companyId, req }) => {
  const auth = await requireAuth();
  const { inviteId } = await req.json();

  if (!inviteId) {
    return NextResponse.json({ error: "inviteId obrigatório" }, { status: 400 });
  }

  // Only ADMINs can resend
  const currentUser = await prisma.companyUser.findFirst({
    where: { companyId, userId: auth.id },
    select: { role: true, name: true },
  });
  if (currentUser?.role !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores podem reenviar convites" }, { status: 403 });
  }

  const old = await prisma.invite.findFirst({
    where: { id: inviteId, companyId },
  });
  if (!old) {
    return NextResponse.json({ error: "Convite não encontrado" }, { status: 404 });
  }
  if (old.usedAt) {
    return NextResponse.json({ error: "Este convite já foi utilizado" }, { status: 409 });
  }

  // Revoke old (expire immediately) and create a fresh invite
  await prisma.invite.update({
    where: { id: old.id },
    data: { expiresAt: new Date() },
  });

  const fresh = await prisma.invite.create({
    data: {
      companyId,
      email: old.email,
      role: old.role,
      invitedBy: currentUser?.name ?? old.invitedBy,
      expiresAt: addDays(new Date(), 7),
    },
  });

  return { token: fresh.token, id: fresh.id };
}, { errorMsg: "Erro ao reenviar convite" });
