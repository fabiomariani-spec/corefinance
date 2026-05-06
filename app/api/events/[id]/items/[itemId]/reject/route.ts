import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-handler";

type Params = { id: string; itemId: string };

export const POST = withAuth<Params>(async ({ companyId, params, req }) => {
  const { id: eventId, itemId } = params;
  const body = await req.json();

  const item = await prisma.eventItem.findFirst({ where: { id: itemId, companyId, eventId } });
  if (!item) return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });

  await prisma.eventItem.update({
    where: { id: itemId },
    data: {
      status: "REJECTED",
      rejectionReason: body.reason || null,
    },
  });

  return { success: true };
}, { errorMsg: "Erro ao recusar lançamento" });
