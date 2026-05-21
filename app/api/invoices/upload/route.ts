import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";

// Upload é leve (só valida, cria job, dispara background fn) — fica em <5s.
// A extração via IA roda numa Netlify Background Function (até 15min),
// e o cliente acompanha por polling em /api/invoices/job/[id].
export const maxDuration = 30;

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const companyId = await getCompanyId();

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const creditCardId = formData.get("creditCardId") as string;

    if (!file) return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });
    if (!creditCardId) return NextResponse.json({ error: "Cartão não especificado" }, { status: 400 });

    const creditCard = await prisma.creditCard.findFirst({
      where: { id: creditCardId, companyId },
    });
    if (!creditCard) return NextResponse.json({ error: "Cartão não encontrado" }, { status: 404 });

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const mediaType = file.type as
      | "image/jpeg"
      | "image/png"
      | "image/webp"
      | "application/pdf";

    // Cria registro de job antes de disparar processamento
    const job = await prisma.invoiceJob.create({
      data: { companyId, creditCardId, status: "PROCESSING" },
    });

    // Dispara background function. Aguarda o 202 do Netlify (que vem em <100ms)
    // porque fire-and-forget em serverless seria descartado quando o lambda
    // termina. A função BG continua rodando em background depois do 202.
    const baseUrl = process.env.URL || process.env.DEPLOY_URL || req.nextUrl.origin;
    const bgUrl = `${baseUrl}/.netlify/functions/process-invoice-background`;
    try {
      const bgRes = await fetch(bgUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, companyId, creditCardId, base64, mediaType }),
      });
      if (bgRes.status !== 202 && !bgRes.ok) {
        const body = await bgRes.text().catch(() => "");
        console.error("[upload] background fn returned", bgRes.status, body.slice(0, 200));
      }
    } catch (err) {
      console.error("[upload] failed to dispatch background fn:", err);
      await prisma.invoiceJob.update({
        where: { id: job.id },
        data: { status: "ERROR", errorMessage: "Falha ao disparar processamento", finishedAt: new Date() },
      }).catch(() => {});
      return NextResponse.json({ error: "Falha ao iniciar processamento" }, { status: 500 });
    }

    return NextResponse.json({ jobId: job.id });
  } catch (error) {
    console.error("Invoice upload error:", error);
    if (error instanceof Error && error.message.includes("autenticado")) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    return NextResponse.json({ error: "Erro ao iniciar upload" }, { status: 500 });
  }
}
