import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";

export async function GET() {
  try {
    const companyId = await getCompanyId();
    const company = await prisma.company.findFirst({
      where: { id: companyId },
      select: { id: true, name: true, headcount: true, currency: true, timezone: true },
    });
    if (!company) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
    return NextResponse.json(company);
  } catch {
    return NextResponse.json({ error: "Erro ao buscar configurações" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const body = await request.json();

    const allowed: Record<string, unknown> = {};
    if (typeof body.headcount === "number") allowed.headcount = Math.max(0, Math.floor(body.headcount));

    const company = await prisma.company.update({
      where: { id: companyId },
      data: allowed,
      select: { id: true, name: true, headcount: true },
    });
    return NextResponse.json(company);
  } catch {
    return NextResponse.json({ error: "Erro ao salvar configurações" }, { status: 500 });
  }
}
