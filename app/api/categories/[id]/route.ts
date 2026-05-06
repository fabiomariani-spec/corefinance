import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-handler";

export const PATCH = withAuth<{ id: string }>(async ({ companyId, params, req }) => {
  const body = await req.json();

  const category = await prisma.category.findFirst({
    where: { id: params.id, companyId },
  });

  if (!category) {
    return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    updateData.name = body.name.trim();
  }
  if (typeof body.color === "string" && body.color.trim()) {
    updateData.color = body.color.trim();
  }
  if (typeof body.isActive === "boolean") {
    updateData.isActive = body.isActive;
  }

  return prisma.category.update({
    where: { id: params.id },
    data: updateData,
  });
}, { errorMsg: "Erro ao atualizar categoria" });

export const DELETE = withAuth<{ id: string }>(async ({ companyId, params }) => {
  // Verify ownership
  const category = await prisma.category.findFirst({
    where: { id: params.id, companyId },
    include: { children: { where: { isActive: true } } },
  });

  if (!category) {
    return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
  }

  // Soft-delete: deactivate this category and all its children
  await prisma.category.updateMany({
    where: { companyId, OR: [{ id: params.id }, { parentId: params.id }] },
    data: { isActive: false },
  });

  return { ok: true };
}, { errorMsg: "Erro ao excluir categoria" });
