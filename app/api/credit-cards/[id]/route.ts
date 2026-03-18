import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const companyId = await getCompanyId();
    const { id } = await params;
    const body = await request.json();

    await prisma.creditCard.updateMany({
      where: { id, companyId },
      data: {
        name: body.name,
        bank: body.bank,
        brand: body.brand,
        lastFour: body.lastFour,
        limit: body.limit,
        closingDay: body.closingDay,
        dueDay: body.dueDay,
        holder: body.holder,
        color: body.color,
      },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const companyId = await getCompanyId();
    const { id } = await params;

    await prisma.creditCard.updateMany({
      where: { id, companyId },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
