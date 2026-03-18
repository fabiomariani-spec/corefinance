import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";
import { extractInvoiceFromFile } from "@/lib/claude";

export async function POST(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const formData = await request.formData();

    const file = formData.get("file") as File;
    const creditCardId = formData.get("creditCardId") as string;

    if (!file) {
      return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });
    }

    if (!creditCardId) {
      return NextResponse.json({ error: "Cartão não especificado" }, { status: 400 });
    }

    // Verify credit card belongs to company
    const creditCard = await prisma.creditCard.findFirst({
      where: { id: creditCardId, companyId },
    });

    if (!creditCard) {
      return NextResponse.json({ error: "Cartão não encontrado" }, { status: 404 });
    }

    // Get existing categories for suggestions
    const categories = await prisma.category.findMany({
      where: { companyId, type: "EXPENSE", isActive: true },
      select: { id: true, name: true },
    });

    // Convert file to base64
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const mediaType = file.type as "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

    // Extract with Claude
    const extracted = await extractInvoiceFromFile(base64, mediaType);

    // Build category memory from past imported transactions
    const recentTx = await prisma.transaction.findMany({
      where: { companyId, categoryId: { not: null }, importSource: "invoice_import" },
      select: { description: true, categoryId: true },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });
    // Normalize to merchant prefix: "MERCADOLIVRE*FOTOCENT" → "mercadolivre"
    function merchantKey(desc: string): string {
      const lower = desc.toLowerCase().trim();
      const starIdx = lower.indexOf("*");
      if (starIdx > 0) return lower.slice(0, starIdx).replace(/[^a-z0-9]/g, "");
      return lower.replace(/[\d\s\-_./]+$/, "").split(/[\s\d]/)[0].replace(/[^a-z]/g, "");
    }

    // Build category memory keyed by merchant prefix
    const descCategoryMemory = new Map<string, string>();
    for (const tx of recentTx) {
      const rawDesc = tx.description.split(" — ")[0];
      const key = merchantKey(rawDesc);
      if (key && key.length >= 3 && !descCategoryMemory.has(key)) {
        descCategoryMemory.set(key, tx.categoryId!);
      }
      // Also store exact match as fallback
      const exact = rawDesc.toLowerCase().trim();
      if (exact && !descCategoryMemory.has(exact)) {
        descCategoryMemory.set(exact, tx.categoryId!);
      }
    }

    // Match suggested categories to existing ones
    const itemsWithCategories = extracted.items.map((item) => {
      // Priority 1: past transaction memory (fuzzy merchant key first, then exact)
      const mKey = merchantKey(item.description);
      const memoryCategoryId = (mKey.length >= 3 && descCategoryMemory.get(mKey)) ||
        descCategoryMemory.get(item.description.toLowerCase().trim());
      if (memoryCategoryId) {
        return { ...item, categoryId: memoryCategoryId, departmentId: null };
      }

      // Priority 2: Claude's suggested category matched against DB categories
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

      return {
        ...item,
        categoryId: matchedCategoryId,
        departmentId: null,
      };
    });

    return NextResponse.json({
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
    return NextResponse.json(
      {
        error:
          (error as { status?: number }).status === 529
            ? "A API de IA está sobrecarregada no momento. Aguarde alguns segundos e tente novamente."
            : "Erro ao processar fatura. Verifique o arquivo e tente novamente.",
      },
      { status: 500 }
    );
  }
}
