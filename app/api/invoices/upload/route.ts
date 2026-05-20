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

    // Dispara background function (fire & forget — não aguardamos resposta)
    const baseUrl = process.env.URL || process.env.DEPLOY_URL || req.nextUrl.origin;
    const bgUrl = `${baseUrl}/.netlify/functions/process-invoice-background`;
    fetch(bgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: job.id, companyId, creditCardId, base64, mediaType }),
    }).catch((err) => console.error("[upload] failed to dispatch background fn:", err));

    return NextResponse.json({ jobId: job.id });
  } catch (error) {
    console.error("Invoice upload error:", error);
    if (error instanceof Error && error.message.includes("autenticado")) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    return NextResponse.json({ error: "Erro ao iniciar upload" }, { status: 500 });
  }
}
