import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const companyId = await getCompanyId();
    const { id } = await params;

    const event = await prisma.event.findFirst({
      where: { id, companyId },
      include: {
        department: { select: { id: true, name: true, color: true } },
        items: {
          include: {
            category: { select: { id: true, name: true, color: true } },
            contact:  { select: { id: true, name: true } },
            transaction: { select: { id: true, status: true, paymentDate: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!event) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

    // Sync INTEGRATED items that are now PAID in the transaction
    const items = event.items.map((item) => {
      let status = item.status;
      if (item.status === "INTEGRATED" && item.transaction?.status === "PAID") {
        status = "PAID" as typeof item.status;
      }
      return { ...item, amount: Number(item.amount), status };
    });

    const budget   = Number(event.budget);
    const planned  = items.filter((i) => !["CANCELLED", "REJECTED"].includes(i.status)).reduce((s, i) => s + i.amount, 0);
    const approved = items.filter((i) => ["INTEGRATED", "PAID"].includes(i.status)).reduce((s, i) => s + i.amount, 0);
    const paid     = items.filter((i) => i.status === "PAID").reduce((s, i) => s + i.amount, 0);
    const pending  = items.filter((i) => i.status === "PENDING_APPROVAL").reduce((s, i) => s + i.amount, 0);
    const rejected = items.filter((i) => i.status === "REJECTED").reduce((s, i) => s + i.amount, 0);

    return NextResponse.json({
      ...event,
      budget,
      items,
      totals: { budget, planned, approved, paid, pending, rejected, balance: budget - planned },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const companyId = await getCompanyId();
    const { id } = await params;
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if (body.name        !== undefined) data.name        = body.name;
    if (body.type        !== undefined) data.type        = body.type || null;
    if (body.startDate   !== undefined) data.startDate   = new Date(body.startDate);
    if (body.endDate     !== undefined) data.endDate     = body.endDate ? new Date(body.endDate) : null;
    if (body.location    !== undefined) data.location    = body.location || null;
    if (body.responsible !== undefined) data.responsible = body.responsible || null;
    if (body.description !== undefined) data.description = body.description || null;
    if (body.budget      !== undefined) data.budget      = body.budget;
    if (body.departmentId !== undefined) data.departmentId = body.departmentId || null;
    if (body.status      !== undefined) data.status      = body.status;

    await prisma.event.updateMany({ where: { id, companyId }, data });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const companyId = await getCompanyId();
    const { id } = await params;
    await prisma.event.deleteMany({ where: { id, companyId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Erro ao excluir" }, { status: 500 });
  }
}
