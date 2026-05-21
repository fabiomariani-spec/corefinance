// Netlify Background Function — pode rodar até 15 minutos (vs 26s das funções sync).
// Disparada por POST de /api/invoices/upload com {jobId, base64, mediaType}.
// Faz a extração com IA e grava o resultado em invoice_jobs.
//
// O sufixo -background no nome do arquivo é o que ativa o modo background.
// Responde 202 imediatamente; cliente acompanha via GET /api/invoices/job/[id].
import { prisma } from "../../lib/prisma";
import { extractInvoiceFromFile, detectMediaType } from "../../lib/claude";

interface BackgroundPayload {
  jobId: string;
  companyId: string;
  creditCardId: string;
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
}

console.log("[bg] module loaded");

export default async (req: Request) => {
  console.log("[bg] handler invoked");
  let jobId: string | undefined;
  try {
    const body = (await req.json()) as BackgroundPayload;
    jobId = body.jobId;
    console.log("[bg] payload received, jobId=", jobId);
    if (!jobId) return new Response("missing jobId", { status: 400 });

    // Source of truth: magic bytes, não declared mimetype.
    const buf = Buffer.from(body.base64, "base64");
    const real = detectMediaType(buf) ?? body.mediaType;
    console.log("[bg] file detected as", real, "size=", buf.length);

    const extracted = await extractInvoiceFromFile(body.base64, real);
    console.log("[bg] extraction done, items=", extracted.items.length);

    // Carrega categorias e memória de descrições pra sugestão automática
    const categories = await prisma.category.findMany({
      where: { companyId: body.companyId, type: "EXPENSE", isActive: true },
      select: { id: true, name: true },
    });

    const recentTx = await prisma.transaction.findMany({
      where: {
        companyId: body.companyId,
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
      where: { id: body.creditCardId, companyId: body.companyId },
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
      data: { status: "READY", result: result as unknown as object, finishedAt: new Date() },
    });

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("[process-invoice-background] error:", err);
    if (jobId) {
      const message = err instanceof Error ? err.message : "Erro desconhecido na extração";
      await prisma.invoiceJob.update({
        where: { id: jobId },
        data: { status: "ERROR", errorMessage: message, finishedAt: new Date() },
      }).catch(() => {});
    }
    return new Response("error", { status: 500 });
  }
};
