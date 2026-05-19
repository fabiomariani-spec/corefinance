import Anthropic from "@anthropic-ai/sdk";
// Import internal module directly — index.js runs a self-test that breaks at build time
// @ts-expect-error — no types for the internal path
import pdfParse from "pdf-parse/lib/pdf-parse.js";

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
  // true se o item soma no totalAmount da fatura deste mês.
  // false = parcela futura, saldo de período anterior, linha informativa.
  chargedThisMonth: boolean;
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

REGRA CRÍTICA — SEÇÕES DA FATURA:
Faturas brasileiras (Itaú, Bradesco, Santander, Nubank, etc.) costumam ter MÚLTIPLAS seções. Você precisa identificar cada item pela seção em que aparece:
- "Lançamentos do período" / "Novas compras" / "Compras nacionais" / "Compras internacionais" / "Pagamentos" / "Encargos" / "Estornos e Créditos" → estes ENTRAM no total deste mês → chargedThisMonth=TRUE
- "Próximas faturas" / "Parcelamentos em aberto" / "Compras parceladas — próximas parcelas" / "Histórico de pagamentos" / "Lançamentos futuros" → NÃO entram no total deste mês → chargedThisMonth=FALSE
- Quando uma compra parcelada aparece com "X/Y", apenas UMA parcela (a deste mês) está na seção atual; as demais estão em "próximas faturas". Marque chargedThisMonth=TRUE só pra parcela do mês corrente.

VALIDAÇÃO OBRIGATÓRIA: antes de retornar, some os amounts de TODOS os itens com chargedThisMonth=true. Esse valor TEM que ficar a ≤1% do totalAmount. Se não bater, revise a marcação — provavelmente você incluiu itens de "próximas faturas" ou esqueceu encargos/créditos do mês.

Extraia TODOS os lançamentos da fatura. Campos por item:
- date: "YYYY-MM-DD"
- description: descrição da compra (texto curto)
- amount: valor decimal em reais. POSITIVO para compras/despesas. NEGATIVO para estornos, créditos, cashback, devoluções e reembolsos.
- isCredit: true se for estorno/crédito/devolução/cashback/reembolso, false para compras normais
- establishment: nome do estabelecimento ou null
- installmentInfo: parcela ex "2/12" ou null
- chargedThisMonth: true se este lançamento soma no totalAmount da fatura deste mês; false se for parcela FUTURA listada apenas pra contexto, saldo de período anterior, ou linha informativa. Use a regra: a soma dos amounts com chargedThisMonth=true tem que bater (com tolerância de centavos) com o totalAmount global. Compras à vista do período: true. Parcela do mês corrente de uma compra parcelada: true. Parcelas dos meses seguintes da mesma compra: false.
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

// Detect real file type from magic bytes, regardless of declared mimetype
export function detectMediaType(buf: Buffer):
  | "application/pdf"
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | null {
  if (buf.length < 12) return null;
  if (buf.slice(0, 4).toString("ascii") === "%PDF") return "application/pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (
    buf.slice(0, 4).toString("ascii") === "RIFF" &&
    buf.slice(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  return null;
}

export async function extractInvoiceFromFile(
  fileBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"
): Promise<InvoiceExtractionResult> {
  // Source of truth: magic bytes, not declared mimetype
  const buf = Buffer.from(fileBase64, "base64");
  const real = detectMediaType(buf) ?? mediaType;

  if (real === "application/pdf") {
    // Try native text extraction first — 10× cheaper, 4× faster than vision
    // Falls back to vision only if PDF has no embedded text (scanned/image-only)
    try {
      const pages = await extractPdfPages(buf);
      const total = pages.join("").trim();
      // Heuristic: real invoices have >200 chars and at least one digit.
      // If not, it's probably a scanned PDF → use vision.
      if (total.length >= 200 && /\d/.test(total)) {
        return extractInvoiceFromPages(pages);
      }
    } catch {
      // pdf-parse can throw on encrypted/corrupt PDFs — fall through to vision
    }
    return extractInvoiceFromPdfVision(fileBase64);
  }

  // Image path (JPEG/PNG/WebP) — vision only
  return extractInvoiceFromImage(fileBase64, real as "image/jpeg" | "image/png" | "image/webp");
}

// Pages per parallel call. 4 pages per chunk with Haiku 4.5 finishes in <22s
// for a 32-page invoice (tested locally), staying under Netlify's 30s proxy
// inactivity timeout even without keep-alive.
const PAGES_PER_CHUNK = 4;

// Extract text page-by-page so we can chunk logically.
async function extractPdfPages(buf: Buffer): Promise<string[]> {
  const pages: string[] = [];
  await pdfParse(buf, {
    pagerender: async (pageData: {
      getTextContent: (opts: { normalizeWhitespace: boolean; disableCombineTextItems: boolean }) => Promise<{ items: { str: string; hasEOL?: boolean }[] }>;
    }) => {
      const content = await pageData.getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      });
      const text = content.items.map((it) => it.str + (it.hasEOL ? "\n" : "")).join("");
      pages.push(text);
      return text;
    },
  });
  return pages;
}

async function extractInvoiceFromPages(pages: string[]): Promise<InvoiceExtractionResult> {
  // Single chunk? Just do one call.
  if (pages.length <= PAGES_PER_CHUNK) {
    return callClaudeWithText(pages.join("\n"));
  }

  // Split into N parallel chunks of PAGES_PER_CHUNK pages each.
  const chunks: string[] = [];
  for (let i = 0; i < pages.length; i += PAGES_PER_CHUNK) {
    chunks.push(pages.slice(i, i + PAGES_PER_CHUNK).join("\n"));
  }

  const results = await Promise.all(chunks.map(callClaudeWithText));

  // Merge: concat items, take first non-null for per-invoice metadata
  return {
    items: results.flatMap((r) => r.items),
    totalAmount: results.find((r) => r.totalAmount)?.totalAmount ?? 0,
    referenceMonth: results.find((r) => r.referenceMonth)?.referenceMonth ?? null,
    dueDate: results.find((r) => r.dueDate)?.dueDate ?? null,
    cardLastFour: results.find((r) => r.cardLastFour)?.cardLastFour ?? null,
    rawText: results.map((r) => r.rawText).join("\n---\n"),
  };
}

async function callClaudeWithText(text: string): Promise<InvoiceExtractionResult> {
  const message = await retryWithBackoff(async () => {
    const stream = client.messages.stream({
      model: "claude-opus-4-7",
      max_tokens: 16000,
      messages: [
        {
          role: "user",
          content: `${EXTRACTION_PROMPT}\n\nConteúdo bruto da fatura (extraído do PDF):\n\n${text}`,
        },
      ],
    });
    return await stream.finalMessage();
  });

  const rawText = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("");

  return parseExtractionResponse(rawText);
}

async function extractInvoiceFromImage(
  base64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp"
): Promise<InvoiceExtractionResult> {
  const message = await retryWithBackoff(async () => {
    const stream = client.messages.stream({
      model: "claude-opus-4-7",
      max_tokens: 32000,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: EXTRACTION_PROMPT },
          ],
        },
      ],
    });
    return await stream.finalMessage();
  });

  const rawText = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("");

  return parseExtractionResponse(rawText);
}

async function extractInvoiceFromPdfVision(pdfBase64: string): Promise<InvoiceExtractionResult> {
  const pdfContent = [
    {
      type: "document" as const,
      source: { type: "base64" as const, media_type: "application/pdf" as const, data: pdfBase64 },
    },
    { type: "text" as const, text: EXTRACTION_PROMPT },
  ];

  const message = await retryWithBackoff(async () => {
    const stream = client.beta.messages.stream({
      model: "claude-opus-4-7",
      max_tokens: 32000,
      betas: ["pdfs-2024-09-25"],
      messages: [
        {
          role: "user",
          content: pdfContent as Parameters<typeof client.beta.messages.create>[0]["messages"][0]["content"],
        },
      ],
    });
    return await stream.finalMessage();
  });

  const rawText = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("");

  return parseExtractionResponse(rawText);
}

// Recover truncated JSON: balances unclosed strings, arrays, objects, and dangling commas.
// Returns null if no JSON start is found at all.
function recoverTruncatedJson(text: string): string | null {
  const first = text.indexOf("{");
  if (first === -1) return null;
  let s = text.slice(first).replace(/\s*```\s*$/, "").trimEnd();
  let inString = false;
  let escape = false;
  const stack: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if (c === "}" || c === "]") stack.pop();
  }
  if (inString) s += '"';
  while (/,\s*$/.test(s)) s = s.replace(/,\s*$/, "").trimEnd();
  if (/"\s*:\s*$/.test(s)) s += "null";
  s += stack.reverse().join("");
  return s;
}

function parseExtractionResponse(rawText: string): InvoiceExtractionResult {
  let parsed: Record<string, unknown> | null = null;

  // 1. Try clean parse
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      // fall through
    }
  }

  // 2. Try recovering truncated JSON (close brackets, strings, etc.)
  if (!parsed) {
    const recovered = recoverTruncatedJson(rawText);
    if (recovered) {
      try {
        parsed = JSON.parse(recovered);
      } catch {
        // fall through
      }
    }
  }

  // 3. Last-resort: regex-extract complete item objects
  if (!parsed) {
    const itemsMatch = rawText.match(/"items"\s*:\s*\[([\s\S]*?)(?:\]\s*,|\]\s*\}|$)/);
    const totalMatch = rawText.match(/"totalAmount"\s*:\s*([\d.]+)/);
    const monthMatch = rawText.match(/"referenceMonth"\s*:\s*"([^"]+)"/);
    const dueMatch = rawText.match(/"dueDate"\s*:\s*"([^"]+)"/);
    const cardMatch = rawText.match(/"cardLastFour"\s*:\s*"([^"]+)"/);

    const itemObjects: ExtractedInvoiceItem[] = [];
    if (itemsMatch) {
      const itemRegex = /\{[^{}]*\}/g;
      let m: RegExpExecArray | null;
      while ((m = itemRegex.exec(itemsMatch[1])) !== null) {
        try {
          itemObjects.push(JSON.parse(m[0]) as ExtractedInvoiceItem);
        } catch { /* skip malformed */ }
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

  const p = parsed as {
    items?: ExtractedInvoiceItem[];
    totalAmount?: number;
    referenceMonth?: string | null;
    dueDate?: string | null;
    cardLastFour?: string | null;
  };
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
