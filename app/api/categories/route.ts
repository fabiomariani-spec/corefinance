import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-handler";

export const GET = withAuth(async ({ companyId, req }) => {
  const type = req.nextUrl.searchParams.get("type");
  const includeInactive = req.nextUrl.searchParams.get("includeInactive") === "1";

  return prisma.category.findMany({
    where: {
      companyId,
      ...(includeInactive ? {} : { isActive: true }),
      parentId: null,
      ...(type && { type: type as "INCOME" | "EXPENSE" }),
    },
    include: {
      children: {
        where: includeInactive ? {} : { isActive: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });
});

export const POST = withAuth(async ({ companyId, req }) => {
  const body = await req.json();
  const category = await prisma.category.create({
    data: {
      companyId,
      name: body.name,
      type: body.type,
      parentId: body.parentId ?? null,
      color: body.color ?? "#6366f1",
      icon: body.icon ?? null,
    },
  });
  return NextResponse.json(category, { status: 201 });
}, { errorMsg: "Erro ao criar categoria" });
