import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { withAuth } from "@/lib/api-handler";
import { addDays } from "date-fns";

// POST /api/team/invite — create an invite
export const POST = withAuth(async ({ companyId, req }) => {
  const auth = await requireAuth();
  const { email, role } = await req.json();

  if (!email || !role) {
    return NextResponse.json({ error: "email e role obrigatórios" }, { status: 400 });
  }

  // Only ADMINs can invite
  const currentUser = await prisma.companyUser.findFirst({
    where: { companyId, userId: auth.id },
    select: { role: true, name: true },
  });
  if (currentUser?.role !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores podem convidar membros" }, { status: 403 });
  }

  // Check if this email is already a member
  const existing = await prisma.companyUser.findFirst({
    where: { companyId, email: email.toLowerCase(), isActive: true },
  });
  if (existing) {
    return NextResponse.json({ error: "Este e-mail já é membro da equipe" }, { status: 409 });
  }

  // Revoke any previous pending invites for this email
  await prisma.invite.updateMany({
    where: { companyId, email: email.toLowerCase(), usedAt: null },
    data: { expiresAt: new Date() }, // expire immediately
  });

  const invite = await prisma.invite.create({
    data: {
      companyId,
      email: email.toLowerCase(),
      role,
      invitedBy: currentUser?.name ?? "Administrador",
      expiresAt: addDays(new Date(), 7),
    },
  });

  return { token: invite.token };
}, { errorMsg: "Erro ao criar convite" });

// DELETE /api/team/invite — revoke an invite (body: { token })
export const DELETE = withAuth(async ({ companyId, req }) => {
  const { token } = await req.json();

  await prisma.invite.updateMany({
    where: { companyId, token },
    data: { expiresAt: new Date() },
  });

  return { ok: true };
}, { errorMsg: "Erro ao revogar convite" });
