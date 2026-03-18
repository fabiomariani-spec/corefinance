import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";

export async function GET() {
  try {
    const companyId = await getCompanyId();
    const departments = await prisma.department.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(departments);
  } catch {
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const body = await request.json();

    const dept = await prisma.department.create({
      data: {
        companyId,
        name: body.name,
        code: body.code ?? null,
        color: body.color ?? "#10b981",
      },
    });

    return NextResponse.json(dept, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Erro ao criar departamento" }, { status: 500 });
  }
}
