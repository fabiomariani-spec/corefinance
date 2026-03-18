import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const companyId = await getCompanyId();
    const { id } = await params;

    const transaction = await prisma.transaction.findFirst({
      where: { id, companyId },
      include: {
        category: true,
        department: true,
        contact: true,
        account: true,
        creditCard: true,
        attachments: true,
      },
    });

    if (!transaction) {
      return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    }

    return NextResponse.json(transaction);
  } catch (error) {
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const companyId = await getCompanyId();
    const { id } = await params;
    const body = await request.json();

    // Only include fields that were explicitly sent — avoids clearing accountId etc. on partial updates
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};
    if (body.description !== undefined) data.description = body.description;
    if (body.amount !== undefined) data.amount = body.amount;
    if (body.type !== undefined) data.type = body.type;
    if (body.status !== undefined) data.status = body.status;
    if (body.isPredicted !== undefined) data.isPredicted = body.isPredicted;
    if (body.isRecurring !== undefined) data.isRecurring = body.isRecurring;
    if (body.categoryId !== undefined) data.categoryId = body.categoryId || null;
    if (body.departmentId !== undefined) data.departmentId = body.departmentId || null;
    if (body.contactId !== undefined) data.contactId = body.contactId || null;
    if (body.accountId !== undefined) data.accountId = body.accountId || null;
    if (body.creditCardId !== undefined) data.creditCardId = body.creditCardId || null;
    if (body.competenceDate !== undefined) data.competenceDate = new Date(body.competenceDate);
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.paymentDate !== undefined) data.paymentDate = body.paymentDate ? new Date(body.paymentDate) : null;
    if (body.paymentMethod !== undefined) data.paymentMethod = body.paymentMethod || null;
    if (body.notes !== undefined) data.notes = body.notes || null;
    if (body.tags !== undefined) data.tags = body.tags;

    const transaction = await prisma.transaction.updateMany({
      where: { id, companyId },
      data,
    });

    return NextResponse.json({ updated: transaction.count });
  } catch (error) {
    return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const companyId = await getCompanyId();
    const { id } = await params;

    await prisma.transaction.deleteMany({
      where: { id, companyId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Erro ao excluir" }, { status: 500 });
  }
}
