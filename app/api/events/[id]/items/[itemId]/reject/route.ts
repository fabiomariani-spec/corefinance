import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const companyId = await getCompanyId();
    const { id: eventId, itemId } = await params;
    const body = await request.json();

    const item = await prisma.eventItem.findFirst({ where: { id: itemId, companyId, eventId } });
    if (!item) return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });

    await prisma.eventItem.update({
      where: { id: itemId },
      data: {
        status: "REJECTED",
        rejectionReason: body.reason || null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Erro ao recusar lançamento" }, { status: 500 });
  }
}
