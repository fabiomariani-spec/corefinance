import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId, requireAuth } from "@/lib/auth";

// GET /api/team — list members + pending invites + current user role
export async function GET() {
  try {
    const companyId = await getCompanyId();
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

    return NextResponse.json({
      members: members.map((m) => ({
        ...m,
        isCurrentUser: m.userId === auth.id,
      })),
      invites,
      currentUserRole: currentUser?.role ?? "VIEWER",
    });
  } catch (error) {
    console.error("GET /api/team error:", error);
    return NextResponse.json({ error: "Erro ao buscar equipe" }, { status: 500 });
  }
}

// DELETE /api/team — remove a member (body: { userId })
export async function DELETE(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const auth = await requireAuth();
    const { userId } = await request.json();

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

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/team error:", error);
    return NextResponse.json({ error: "Erro ao remover membro" }, { status: 500 });
  }
}
