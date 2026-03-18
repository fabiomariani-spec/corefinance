import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    const categories = await prisma.category.findMany({
      where: {
        companyId,
        isActive: true,
        parentId: null,
        ...(type && { type: type as "INCOME" | "EXPENSE" }),
      },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(categories);
  } catch {
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const body = await request.json();

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
  } catch {
    return NextResponse.json({ error: "Erro ao criar categoria" }, { status: 500 });
  }
}
