import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-handler";

export const PATCH = withAuth<{ id: string }>(async ({ companyId, params, req }) => {
  const body = await req.json();

  const dept = await prisma.department.findFirst({
    where: { id: params.id, companyId },
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

  return prisma.department.update({
    where: { id: params.id },
    data: updateData,
  });
}, { errorMsg: "Erro ao atualizar departamento" });

export const DELETE = withAuth<{ id: string }>(async ({ companyId, params }) => {
  const dept = await prisma.department.findFirst({
    where: { id: params.id, companyId },
  });

  if (!dept) {
    return NextResponse.json({ error: "Departamento não encontrado" }, { status: 404 });
  }

  await prisma.department.update({
    where: { id: params.id },
    data: { isActive: false },
  });

  return { ok: true };
}, { errorMsg: "Erro ao excluir departamento" });
