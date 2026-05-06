import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-handler";

export const GET = withAuth(async ({ companyId }) => {
  return prisma.department.findMany({
    where: { companyId, isActive: true },
    orderBy: { name: "asc" },
  });
});

export const POST = withAuth(async ({ companyId, req }) => {
  const body = await req.json();
  const dept = await prisma.department.create({
    data: {
      companyId,
      name: body.name,
      code: body.code ?? null,
      color: body.color ?? "#10b981",
    },
  });
  return NextResponse.json(dept, { status: 201 });
}, { errorMsg: "Erro ao criar departamento" });
