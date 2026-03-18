import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const companyId = await getCompanyId();
    const { id } = await params;
    const body = await request.json();

    const dept = await prisma.department.findFirst({
      where: { id, companyId },
    });

    if (!dept) {
      return NextResponse.json({ error: "Departamento não encontrado" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (typeof body.monthlyBudget === "number") {
      updateData.monthlyBudget = Math.max(0, body.monthlyBudget);
    }
    if (typeof body.name === "string" && body.name.trim()) {
      updateData.name = body.name.trim();
    }
    if (typeof body.color === "string") {
      updateData.color = body.color;
    }

    const updated = await prisma.department.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Patch department error:", error);
    return NextResponse.json({ error: "Erro ao atualizar departamento" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const companyId = await getCompanyId();
    const { id } = await params;

    // Verify ownership
    const dept = await prisma.department.findFirst({
      where: { id, companyId },
    });

    if (!dept) {
      return NextResponse.json({ error: "Departamento não encontrado" }, { status: 404 });
    }

    // Soft-delete
    await prisma.department.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete department error:", error);
    return NextResponse.json({ error: "Erro ao excluir departamento" }, { status: 500 });
  }
}
