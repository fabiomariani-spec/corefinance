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

    const category = await prisma.category.findFirst({
      where: { id, companyId },
    });

    if (!category) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) {
      updateData.name = body.name.trim();
    }

    const updated = await prisma.category.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Patch category error:", error);
    return NextResponse.json({ error: "Erro ao atualizar categoria" }, { status: 500 });
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
    const category = await prisma.category.findFirst({
      where: { id, companyId },
      include: { children: { where: { isActive: true } } },
    });

    if (!category) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    }

    // Soft-delete: deactivate this category and all its children
    await prisma.category.updateMany({
      where: { companyId, OR: [{ id }, { parentId: id }] },
      data: { isActive: false },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete category error:", error);
    return NextResponse.json({ error: "Erro ao excluir categoria" }, { status: 500 });
  }
}
