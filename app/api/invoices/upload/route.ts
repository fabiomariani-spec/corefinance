import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";
import { extractInvoiceFromFile } from "@/lib/claude";

export const maxDuration = 120;

/**
 * Upload fatura: pode demorar 30-60s para PDFs grandes.
 *
 * A Netlify (e a maioria dos CDNs) fecha a conexão após ~30s sem receber
 * bytes. Então envolvemos o processamento em um ReadableStream que cospe
 * um byte de keep-alive (whitespace) a cada 5s e só envia o JSON final
 * quando termina. JSON.parse aceita leading whitespace, então o client
 * existente (res.json()) continua funcionando sem mudança.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendKeepalive = () => {
        try {
          controller.enqueue(encoder.encode(" "));
        } catch {
          // controller closed — stop pinging
        }
      };
      const keepaliveTimer = setInterval(sendKeepalive, 5000);

      const sendJson = (status: number, body: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(body)));
        clearInterval(keepaliveTimer);
        controller.close();
        return status;
      };

      try {
        const companyId = await getCompanyId();

        const formData = await req.formData();
        const file = formData.get("file") as File;
        const creditCardId = formData.get("creditCardId") as string;

        if (!file) return sendJson(400, { error: "Arquivo não enviado" });
        if (!creditCardId) return sendJson(400, { error: "Cartão não especificado" });

        const creditCard = await prisma.creditCard.findFirst({
          where: { id: creditCardId, companyId },
        });
        if (!creditCard) return sendJson(404, { error: "Cartão não encontrado" });

        const categories = await prisma.category.findMany({
          where: { companyId, type: "EXPENSE", isActive: true },
          select: { id: true, name: true },
        });

        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        const mediaType = file.type as
          | "image/jpeg"
          | "image/png"
          | "image/webp"
          | "application/pdf";

        const extracted = await extractInvoiceFromFile(base64, mediaType);

        // Build category memory from past imported transactions
        const recentTx = await prisma.transaction.findMany({
          where: {
            companyId,
            categoryId: { not: null },
            importSource: "invoice_import",
          },
          select: { description: true, categoryId: true },
          orderBy: { createdAt: "desc" },
          take: 1000,
        });

        function merchantKey(desc: string): string {
          const lower = desc.toLowerCase().trim();
          const starIdx = lower.indexOf("*");
          if (starIdx > 0) return lower.slice(0, starIdx).replace(/[^a-z0-9]/g, "");
          return lower
            .replace(/[\d\s\-_./]+$/, "")
            .split(/[\s\d]/)[0]
            .replace(/[^a-z]/g, "");
        }

        const descCategoryMemory = new Map<string, string>();
        for (const tx of recentTx) {
          const rawDesc = tx.description.split(" — ")[0];
          const key = merchantKey(rawDesc);
          if (key && key.length >= 3 && !descCategoryMemory.has(key)) {
            descCategoryMemory.set(key, tx.categoryId!);
          }
          const exact = rawDesc.toLowerCase().trim();
          if (exact && !descCategoryMemory.has(exact)) {
            descCategoryMemory.set(exact, tx.categoryId!);
          }
        }

        const itemsWithCategories = extracted.items.map((item) => {
          const mKey = merchantKey(item.description);
          const memoryCategoryId =
            (mKey.length >= 3 && descCategoryMemory.get(mKey)) ||
            descCategoryMemory.get(item.description.toLowerCase().trim());
          if (memoryCategoryId) {
            return { ...item, categoryId: memoryCategoryId, departmentId: null };
          }

          let matchedCategoryId: string | null = null;
          if (item.suggestedCategory) {
            const suggested = item.suggestedCategory.toLowerCase();
            const match = categories.find(
              (c) =>
                c.name.toLowerCase().includes(suggested) ||
                suggested.includes(c.name.toLowerCase())
            );
            matchedCategoryId = match?.id ?? null;
          }

          return { ...item, categoryId: matchedCategoryId, departmentId: null };
        });

        return sendJson(200, {
          items: itemsWithCategories,
          totalAmount: extracted.totalAmount,
          referenceMonth: extracted.referenceMonth,
          dueDate: extracted.dueDate,
          cardLastFour: extracted.cardLastFour,
          creditCard: {
            id: creditCard.id,
            name: creditCard.name,
            brand: creditCard.brand,
          },
          categories: categories,
        });
      } catch (error) {
        console.error("Invoice upload error:", error);

        if (error instanceof Error && error.message.includes("autenticado")) {
          return sendJson(401, { error: "Não autenticado" });
        }

        if ((error as { status?: number }).status === 529) {
          return sendJson(500, {
            error:
              "A API de IA está sobrecarregada no momento. Aguarde alguns segundos e tente novamente.",
          });
        }

        return sendJson(500, {
          error: "Erro ao processar fatura. Verifique o arquivo e tente novamente.",
        });
      }
    },
  });

  // Note: the real HTTP status is always 200 here — the keep-alive stream needs
  // an open connection. Errors are encoded in the JSON body as `{ error: ... }`.
  // The client already checks for `json.error` and shows the message.
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
