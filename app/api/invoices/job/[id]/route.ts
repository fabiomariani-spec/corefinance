import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";

// Polling endpoint — frontend chama aqui de 2 em 2s pra ver se a extração
// terminou. Retorna { status, result?, error?, elapsedMs }.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const companyId = await getCompanyId();
    const { id } = await params;

    const job = await prisma.invoiceJob.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        status: true,
        result: true,
        errorMessage: true,
        startedAt: true,
        finishedAt: true,
      },
    });

    if (!job) return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });

    const elapsedMs = job.finishedAt
      ? job.finishedAt.getTime() - job.startedAt.getTime()
      : Date.now() - job.startedAt.getTime();

    return NextResponse.json({
      status: job.status,
      result: job.status === "READY" ? job.result : null,
      error: job.status === "ERROR" ? job.errorMessage : null,
      elapsedMs,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("autenticado")) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    return NextResponse.json({ error: "Erro ao buscar job" }, { status: 500 });
  }
}
