import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId, requireAuth } from "@/lib/auth";
import { addDays } from "date-fns";

// POST /api/team/invite — create an invite
export async function POST(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const auth = await requireAuth();
    const { email, role } = await request.json();

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

    return NextResponse.json({ token: invite.token });
  } catch (error) {
    console.error("POST /api/team/invite error:", error);
    return NextResponse.json({ error: "Erro ao criar convite" }, { status: 500 });
  }
}

// DELETE /api/team/invite — revoke an invite (body: { token })
export async function DELETE(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const { token } = await request.json();

    await prisma.invite.updateMany({
      where: { companyId, token },
      data: { expiresAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/team/invite error:", error);
    return NextResponse.json({ error: "Erro ao revogar convite" }, { status: 500 });
  }
}
