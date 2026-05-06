import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-handler";
import {
  generateSalaryTransactions,
  cancelFutureSalary,
  deleteFuturePendingSalary,
} from "@/lib/salary";

// ── POST /api/employees/[id]/status ──────────────────────────────────────────

export const POST = withAuth<{ id: string }>(async ({ companyId, params, req }) => {
  const body = await req.json();
  const { status, dismissDate } = body;

  if (!["ACTIVE", "PAUSED", "DISMISSED"].includes(status)) {
    return NextResponse.json({ error: "Status inválido" }, { status: 400 });
  }

  const existing = await prisma.employee.findFirst({ where: { id: params.id, companyId } });
  if (!existing) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const data: Record<string, unknown> = { status };
  if (status === "DISMISSED") {
    // Aceita data de distrato do form; se não vier, usa hoje
    data.dismissDate = dismissDate ? new Date(dismissDate + "T12:00:00") : new Date();
  }
  if (status === "ACTIVE") data.dismissDate = null;

  const updated = await prisma.employee.update({ where: { id: params.id }, data });

  if (status === "PAUSED" || status === "DISMISSED") {
    // Pausado/desligado: cancela futuros (mantém histórico "previa pagar, cancelou")
    await cancelFutureSalary(params.id);
  } else if (status === "ACTIVE") {
    // Reativado: limpa qualquer PENDING futuro (sobras de ciclos anteriores)
    // antes de regenerar, pra evitar duplicatas
    await deleteFuturePendingSalary(params.id);
    const cat = await prisma.category.findFirst({
      where: { companyId, name: "Folha de Pagamento", type: "EXPENSE" },
    });
    if (cat) await generateSalaryTransactions(updated, companyId, cat.id);
  }

  return { employee: updated };
}, { errorMsg: "Erro ao alterar status" });
