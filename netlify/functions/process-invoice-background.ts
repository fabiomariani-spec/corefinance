// Netlify Background Function — pode rodar até 15 minutos (vs 26s das funções sync).
// Disparada por POST de /api/invoices/upload com {jobId, base64, mediaType}.
// Faz a extração com IA e grava o resultado em invoice_jobs.
//
// O sufixo -background no nome do arquivo é o que ativa o modo background.
// Responde 202 imediatamente; cliente acompanha via GET /api/invoices/job/[id].
import { prisma } from "../../lib/prisma";

interface BackgroundPayload {
  jobId: string;
}

console.log("[bg] module loaded");

// Helper: marca progresso no DB (errorMessage usado como log persistente).
async function markProgress(jobId: string | undefined, msg: string) {
  console.log("[bg]", msg);
  if (!jobId) return;
  try {
    await prisma.invoiceJob.update({ where: { id: jobId }, data: { errorMessage: msg } });
  } catch (e) {
    console.error("[bg] markProgress failed:", e);
  }
}

export default async (req: Request) => {
  console.log("[bg] handler invoked");
  let jobId: string | undefined;
  try {
    const body = (await req.json()) as BackgroundPayload;
    jobId = body.jobId;
    await markProgress(jobId, "1/4 jobId recebido, lendo payload do DB");
    if (!jobId) return new Response("missing jobId", { status: 400 });

    // Lê base64 + metadata do DB (não vem no body por causa do limite de
    // request da BG fn do Netlify ~256KB)
    const jobData = await prisma.invoiceJob.findUnique({
      where: { id: jobId },
      select: { companyId: true, creditCardId: true, payload: true, mediaType: true },
    });
    if (!jobData || !jobData.payload) {
      await markProgress(jobId, "ERROR: job ou payload não encontrado no DB");
      return new Response("missing payload", { status: 400 });
    }

    await markProgress(jobId, "2/4 carregando extrator");
    const { extractInvoiceFromFile, detectMediaType } = await import("../../lib/claude");

    const buf = Buffer.from(jobData.payload, "base64");
    const real = detectMediaType(buf) ?? (jobData.mediaType as
      | "image/jpeg" | "image/png" | "image/webp" | "application/pdf"
      | null) ?? "application/pdf";

    await markProgress(jobId, `3/4 extraindo IA (${real}, ${buf.length} bytes)`);
    const extracted = await extractInvoiceFromFile(jobData.payload, real);

    await markProgress(jobId, `4/4 ${extracted.items.length} itens extraídos, salvando categorias`);

    const body_companyId = jobData.companyId;
    const body_creditCardId = jobData.creditCardId;

    const categories = await prisma.category.findMany({
      where: { companyId: body_companyId, type: "EXPENSE", isActive: true },
      select: { id: true, name: true },
    });

    const recentTx = await prisma.transaction.findMany({
      where: {
        companyId: body_companyId,
        categoryId: { not: null },
        importSource: "invoice_import",
      },
      select: { description: true, categoryId: true },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });

    const merchantKey = (desc: string): string => {
      const lower = desc.toLowerCase().trim();
      const starIdx = lower.indexOf("*");
      if (starIdx > 0) return lower.slice(0, starIdx).replace(/[^a-z0-9]/g, "");
      return lower.replace(/[\d\s\-_./]+$/, "").split(/[\s\d]/)[0].replace(/[^a-z]/g, "");
    };

    const memory = new Map<string, string>();
    for (const tx of recentTx) {
      const rawDesc = tx.description.split(" — ")[0];
      const key = merchantKey(rawDesc);
      if (key && key.length >= 3 && !memory.has(key)) memory.set(key, tx.categoryId!);
      const exact = rawDesc.toLowerCase().trim();
      if (exact && !memory.has(exact)) memory.set(exact, tx.categoryId!);
    }

    const items = extracted.items.map((item) => {
      const mKey = merchantKey(item.description);
      const memCatId =
        (mKey.length >= 3 && memory.get(mKey)) ||
        memory.get(item.description.toLowerCase().trim());
      if (memCatId) return { ...item, categoryId: memCatId, departmentId: null };

      let matched: string | null = null;
      if (item.suggestedCategory) {
        const suggested = item.suggestedCategory.toLowerCase();
        const cat = categories.find(
          (c) => c.name.toLowerCase().includes(suggested) || suggested.includes(c.name.toLowerCase())
        );
        matched = cat?.id ?? null;
      }
      return { ...item, categoryId: matched, departmentId: null };
    });

    const creditCard = await prisma.creditCard.findFirst({
      where: { id: body_creditCardId, companyId: body_companyId },
      select: { id: true, name: true, brand: true },
    });

    const result = {
      items,
      totalAmount: extracted.totalAmount,
      referenceMonth: extracted.referenceMonth,
      dueDate: extracted.dueDate,
      cardLastFour: extracted.cardLastFour,
      creditCard,
      categories,
    };

    await prisma.invoiceJob.update({
      where: { id: jobId },
      data: {
        status: "READY",
        errorMessage: null,
        result: result as unknown as object,
        finishedAt: new Date(),
        payload: null, // libera espaço — não precisa mais do base64
      },
    });

    return new Response("ok", { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? `${err.message}\n${err.stack?.slice(0, 500) ?? ""}` : "Erro desconhecido na extração";
    console.error("[bg] error:", message);
    if (jobId) {
      try {
        await prisma.invoiceJob.update({
          where: { id: jobId },
          data: { status: "ERROR", errorMessage: message, finishedAt: new Date() },
        });
      } catch (e) {
        console.error("[bg] failed to mark job as ERROR:", e);
      }
    }
    return new Response("error", { status: 500 });
  }
};
