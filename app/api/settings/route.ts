import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-handler";

export const GET = withAuth(async ({ companyId }) => {
  const company = await prisma.company.findFirst({
    where: { id: companyId },
    select: { id: true, name: true, headcount: true, currency: true, timezone: true },
  });
  if (!company) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
  return company;
}, { errorMsg: "Erro ao buscar configurações" });

export const PATCH = withAuth(async ({ companyId, req }) => {
  const body = await req.json();

  const allowed: Record<string, unknown> = {};
  if (typeof body.headcount === "number") allowed.headcount = Math.max(0, Math.floor(body.headcount));

  return prisma.company.update({
    where: { id: companyId },
    data: allowed,
    select: { id: true, name: true, headcount: true },
  });
}, { errorMsg: "Erro ao salvar configurações" });
