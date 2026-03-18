import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ExtractedInvoiceItem {
  date: string;
  description: string;
  amount: number;      // negative for credits/refunds
  isCredit: boolean;   // true for estornos, cashback, devoluções
  establishment: string | null;
  installmentInfo: string | null;
  suggestedCategory: string | null;
}

export interface InvoiceExtractionResult {
  items: ExtractedInvoiceItem[];
  totalAmount: number;
  referenceMonth: string | null;
  dueDate: string | null;
  cardLastFour: string | null;
  rawText: string;
}

const EXTRACTION_PROMPT = `Você é um especialista em faturas de cartão de crédito brasileiro.

Extraia TODOS os lançamentos da fatura. Campos por item:
- date: "YYYY-MM-DD"
- description: descrição da compra (texto curto)
- amount: valor decimal em reais. POSITIVO para compras/despesas. NEGATIVO para estornos, créditos, cashback, devoluções e reembolsos.
- isCredit: true se for estorno/crédito/devolução/cashback/reembolso, false para compras normais
- establishment: nome do estabelecimento ou null
- installmentInfo: parcela ex "2/12" ou null
- suggestedCategory: Alimentação|Transporte|Supermercado|Farmácia|Combustível|Streaming|Software|Restaurante|Hotel|Viagem|Vestuário|Saúde|Educação|Lazer|Serviços|Outros

Campos globais: totalAmount (valor líquido total da fatura, exatamente como impresso), referenceMonth (YYYY-MM), dueDate (YYYY-MM-DD), cardLastFour.

IMPORTANTE: estornos aparecem com palavras como "Estorno", "Crédito", "Devolução", "Cashback", "Reembolso" ou valores com sinal negativo na fatura — extraia o amount como NEGATIVO.

RESPONDA SOMENTE com JSON minificado (sem espaços nem quebras de linha). Sem texto antes ou depois.`;

async function retryWithBackoff<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      const isRetryable = status === 529 || status === 500;
      if (!isRetryable || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, (i + 1) * 3000)); // 3s, 6s
    }
  }
  throw new Error("unreachable");
}

export async function extractInvoiceFromFile(
  fileBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"
): Promise<InvoiceExtractionResult> {
  const isImage = mediaType !== "application/pdf";

  if (isImage) {
    const imageContent = [
      {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: mediaType as "image/jpeg" | "image/png" | "image/webp",
          data: fileBase64,
        },
      },
      { type: "text" as const, text: EXTRACTION_PROMPT },
    ];

    const message = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content: imageContent }],
    });

    const rawText = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("");

    return parseExtractionResponse(rawText);
  } else {
    // PDF via beta API (required for document blocks)
    const pdfContent = [
      {
        type: "document" as const,
        source: {
          type: "base64" as const,
          media_type: "application/pdf" as const,
          data: fileBase64,
        },
      },
      { type: "text" as const, text: EXTRACTION_PROMPT },
    ];

    const message = await retryWithBackoff(() =>
      client.beta.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 8192,
        betas: ["pdfs-2024-09-25"],
        messages: [{ role: "user", content: pdfContent as Parameters<typeof client.beta.messages.create>[0]["messages"][0]["content"] }],
      })
    );

    const rawText = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("");

    return parseExtractionResponse(rawText);
  }
}

function parseExtractionResponse(rawText: string): InvoiceExtractionResult {

  // Tentar parse direto
  let parsed: Record<string, unknown>;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("sem JSON");
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    // Fallback: JSON truncado — recupera itens completos via regex
    const itemsMatch = rawText.match(/"items"\s*:\s*\[([\s\S]*?)(?:\]\s*,|\]\s*\}|$)/);
    const totalMatch = rawText.match(/"totalAmount"\s*:\s*([\d.]+)/);
    const monthMatch = rawText.match(/"referenceMonth"\s*:\s*"([^"]+)"/);
    const dueMatch   = rawText.match(/"dueDate"\s*:\s*"([^"]+)"/);
    const cardMatch  = rawText.match(/"cardLastFour"\s*:\s*"([^"]+)"/);

    // Extrai objetos JSON completos do array de itens (evita pegar itens cortados)
    const itemObjects: ExtractedInvoiceItem[] = [];
    if (itemsMatch) {
      const itemRegex = /\{[^{}]*\}/g;
      let m: RegExpExecArray | null;
      while ((m = itemRegex.exec(itemsMatch[1])) !== null) {
        try {
          itemObjects.push(JSON.parse(m[0]) as ExtractedInvoiceItem);
        } catch { /* item mal formado, pula */ }
      }
    }

    parsed = {
      items: itemObjects,
      totalAmount: totalMatch ? parseFloat(totalMatch[1]) : 0,
      referenceMonth: monthMatch ? monthMatch[1] : null,
      dueDate: dueMatch ? dueMatch[1] : null,
      cardLastFour: cardMatch ? cardMatch[1] : null,
    };
  }

  const p = parsed as { items?: ExtractedInvoiceItem[]; totalAmount?: number; referenceMonth?: string | null; dueDate?: string | null; cardLastFour?: string | null };
  return {
    items: p.items ?? [],
    totalAmount: p.totalAmount ?? 0,
    referenceMonth: p.referenceMonth ?? null,
    dueDate: p.dueDate ?? null,
    cardLastFour: p.cardLastFour ?? null,
    rawText,
  };
}

export async function suggestCategory(
  description: string,
  existingCategories: string[]
): Promise<{ category: string; confidence: number }> {
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content: `Dado o seguinte lançamento financeiro: "${description}"

E estas categorias disponíveis: ${existingCategories.join(", ")}

Qual categoria se encaixa melhor? Responda em JSON: {"category": "nome", "confidence": 0.9}`,
      },
    ],
  });

  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { category: existingCategories[0] ?? "Outros", confidence: 0.3 };

  return JSON.parse(jsonMatch[0]);
}
