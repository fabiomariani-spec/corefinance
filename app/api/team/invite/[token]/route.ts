import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gerente",
  ACCOUNTANT: "Financeiro",
  VIEWER: "Visualizador",
};

// GET /api/team/invite/[token] — public: get invite details
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const invite = await prisma.invite.findUnique({
      where: { token },
      include: { company: { select: { id: true, name: true } } },
    });

    if (!invite) {
      return NextResponse.json({ error: "Convite não encontrado" }, { status: 404 });
    }
    if (invite.usedAt) {
      return NextResponse.json({ error: "Este convite já foi utilizado" }, { status: 410 });
    }
    if (invite.expiresAt < new Date()) {
      return NextResponse.json({ error: "Este convite expirou" }, { status: 410 });
    }

    return NextResponse.json({
      email: invite.email,
      role: invite.role,
      roleLabel: ROLE_LABELS[invite.role] ?? invite.role,
      invitedBy: invite.invitedBy,
      companyName: invite.company.name,
      expiresAt: invite.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("GET invite error:", error);
    return NextResponse.json({ error: "Erro ao buscar convite" }, { status: 500 });
  }
}

// POST /api/team/invite/[token] — accept invite (user must be authenticated)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json().catch(() => ({}));

    // For new users: they might pass name directly (register flow)
    const { name: bodyName } = body as { name?: string };

    // Get current Supabase user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Autenticação necessária" }, { status: 401 });
    }

    const invite = await prisma.invite.findUnique({
      where: { token },
      include: { company: { select: { id: true, name: true } } },
    });

    if (!invite) {
      return NextResponse.json({ error: "Convite não encontrado" }, { status: 404 });
    }
    if (invite.usedAt) {
      return NextResponse.json({ error: "Este convite já foi utilizado" }, { status: 410 });
    }
    if (invite.expiresAt < new Date()) {
      return NextResponse.json({ error: "Este convite expirou" }, { status: 410 });
    }

    const displayName = bodyName || user.user_metadata?.name || user.email!.split("@")[0];

    // Link user to company (upsert in case they already have an inactive record)
    await prisma.companyUser.upsert({
      where: {
        companyId_userId: {
          companyId: invite.companyId,
          userId: user.id,
        },
      },
      update: {
        isActive: true,
        role: invite.role,
        name: displayName,
        email: user.email!,
      },
      create: {
        companyId: invite.companyId,
        userId: user.id,
        role: invite.role,
        name: displayName,
        email: user.email!,
      },
    });

    // Mark invite as used
    await prisma.invite.update({
      where: { token },
      data: { usedAt: new Date() },
    });

    return NextResponse.json({ ok: true, companyName: invite.company.name });
  } catch (error) {
    console.error("POST accept invite error:", error);
    return NextResponse.json({ error: "Erro ao aceitar convite" }, { status: 500 });
  }
}
