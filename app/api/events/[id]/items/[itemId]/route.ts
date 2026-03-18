import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const companyId = await getCompanyId();
    const { itemId } = await params;
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if (body.description   !== undefined) data.description   = body.description;
    if (body.amount        !== undefined) data.amount        = body.amount;
    if (body.categoryId    !== undefined) data.categoryId    = body.categoryId    || null;
    if (body.contactId     !== undefined) data.contactId     = body.contactId     || null;
    if (body.dueDate       !== undefined) data.dueDate       = body.dueDate       ? new Date(body.dueDate) : null;
    if (body.paymentMethod !== undefined) data.paymentMethod = body.paymentMethod || null;
    if (body.notes         !== undefined) data.notes         = body.notes         || null;
    if (body.requestedBy   !== undefined) data.requestedBy   = body.requestedBy   || null;
    if (body.status        !== undefined) data.status        = body.status;

    await prisma.eventItem.updateMany({ where: { id: itemId, companyId }, data });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const companyId = await getCompanyId();
    const { itemId } = await params;
    await prisma.eventItem.deleteMany({ where: { id: itemId, companyId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Erro ao excluir" }, { status: 500 });
  }
}
