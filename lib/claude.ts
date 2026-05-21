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
  // Header da seção onde o item aparece na fatura, literalmente como impresso.
  // Ex: "Lançamentos do período", "Próximas faturas", "Compras parceladas em aberto",
  // "Pagamentos efetuados", "Encargos", "Estornos e créditos". null se a IA não conseguiu.
  section: string | null;
  // Derived no servidor a partir do section. true = entra no total deste mês.
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

⚠️ A REGRA MAIS IMPORTANTE — IDENTIFIQUE A SEÇÃO DE CADA ITEM:

Toda fatura BR tem várias SEÇÕES com cabeçalhos. Você DEVE registrar em qual seção cada item aparece. Esse é o campo \`section\` no JSON — copie LITERALMENTE o texto do cabeçalho da seção (ex: "Lançamentos do período", "Próximas faturas", etc).

EXEMPLOS REAIS DE CABEÇALHOS DE SEÇÃO (use o que estiver na fatura):

ITAÚ: "Lançamentos no período - Cartão final XXXX" | "Lançamentos no período - Internacional" | "Compras parceladas - próximas faturas" | "Encargos do período" | "Créditos" | "Pagamentos efetuados"

BRADESCO: "Lançamentos do período" | "Compras parceladas em aberto" | "Pagamento(s) efetuado(s)" | "Encargos" | "Próximas parcelas"

C6 BANK: "Lançamentos" | "Pagamentos" | "Próximas faturas" | "Compras parceladas em aberto" | "Cashback" | "Encargos contratuais"

NUBANK: "Transações do período" | "Compras parceladas - próximas faturas" | "Pagamento" | "IOF" | "Estorno"

SANTANDER: "Lançamentos do período" | "Lançamentos parcelados em aberto" | "Pagamentos" | "Encargos"

GENÉRICOS (qualquer banco): "Resumo da fatura", "Sumário", "Detalhamento por cartão adicional"

REGRA DE NEGÓCIO — O QUE ENTRA NO TOTAL DESTE MÊS:
✅ ENTRA: seções tipo "Lançamentos do período" / "Transações" / "Compras nacionais/internacionais" / "Encargos" / "Estornos/Créditos / Cashback do período" / "IOF" / "Anuidade"
❌ NÃO ENTRA: "Próximas faturas" / "Compras parceladas em aberto" (são as parcelas FUTURAS que vão pra próximas faturas — não conta neste mês) / "Pagamento efetuado" da fatura anterior (NÃO é crédito, é só registro)

Pra cada item:
- date: "YYYY-MM-DD" da transação
- description: texto curto da compra
- amount: positivo pra despesas, NEGATIVO pra créditos/estornos/cashback/devoluções
- isCredit: true se for estorno/cashback/devolução, false caso contrário
- establishment: nome do estabelecimento ou null
- installmentInfo: "X/Y" pra parcelado, null caso contrário
- section: COPIE EXATAMENTE o cabeçalho da seção (string), ou null se não conseguir identificar
- chargedThisMonth: derive da seção. true se a seção entra no total. false se for "próximas faturas" / "parceladas em aberto" / "pagamento efetuado"
- suggestedCategory: Alimentação|Transporte|Supermercado|Farmácia|Combustível|Streaming|Software|Restaurante|Hotel|Viagem|Vestuário|Saúde|Educação|Lazer|Serviços|Outros

⚠️ ARMADILHA COMUM: na seção "Compras parceladas em aberto" os bancos costumam listar TODAS as parcelas restantes com o valor da PARCELA (não do saldo total). Mesmo que pareça um lançamento normal, se está nessa seção → chargedThisMonth=FALSE.

⚠️ ARMADILHA #2: "Pagamento efetuado" / "PAGTO POR DEB EM C/C" — é o pagamento da fatura anterior. NÃO é crédito do mês. Coloque section="Pagamentos efetuados" e chargedThisMonth=FALSE.

VALIDAÇÃO ANTES DE RETORNAR: some amounts dos itens com chargedThisMonth=true. Deve ficar dentro de 2% do totalAmount global. Se errar muito, você provavelmente marcou parcelas futuras como deste mês — REVISE.

Campos globais: totalAmount (valor "Total a pagar" exato), referenceMonth (YYYY-MM), dueDate (YYYY-MM-DD), cardLastFour.

RESPONDA SOMENTE com JSON minificado, sem espaços/quebras, sem texto fora.`;

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
        const textResult = await extractInvoiceFromPages(pages);
        // Validação: alguns PDFs (notavelmente C6 Bank) têm texto onde o ID
        // do estabelecimento e o valor numérico vêm concatenados sem espaço,
        // o que faz a IA parsear valores absurdos (ex: R$ 213k em vez de R$ 13k).
        // Sinal: soma dos itens deste mês > 2x o total impresso da fatura.
        // Quando isso acontece, refaz tudo via vision (Opus olha o layout 2D).
        const sumCharged = textResult.items
          .filter((it) => it.chargedThisMonth)
          .reduce((s, it) => s + it.amount, 0);
        const parsingLikelyBroken =
          textResult.totalAmount > 0 &&
          Math.abs(sumCharged) > textResult.totalAmount * 2;
        if (!parsingLikelyBroken) return textResult;
        // text path ambíguo → cai pra vision
      }
    } catch {
      // pdf-parse can throw on encrypted/corrupt PDFs — fall through to vision
    }
    return extractInvoiceFromPdfVision(fileBase64);
  }

  // Image path (JPEG/PNG/WebP) — vision only
  return extractInvoiceFromImage(fileBase64, real as "image/jpeg" | "image/png" | "image/webp");
}

// Pages per parallel call. 4 páginas por chunk com Opus 4.7 finishes em
// ~80-90s pra fatura de 34 páginas (testado offline). Precisa maxDuration
// no route.ts maior que isso (atualmente 240s na route /api/invoices/upload).
const PAGES_PER_CHUNK = 4;

// Extract text page-by-page so we can chunk logically.
// disableCombineTextItems: true → mantém items separados em vez de concatenar.
// Crítico pra faturas tipo C6 onde IDs e valores ficariam grudados (ex:
// "FACEBK *ECS7XKVPJ23.274,34" vira ambíguo entre PJ2+3.274 e PJ+23.274).
// Com items separados, juntamos com "|" pra preservar o boundary.
async function extractPdfPages(buf: Buffer): Promise<string[]> {
  const pages: string[] = [];
  await pdfParse(buf, {
    pagerender: async (pageData: {
      getTextContent: (opts: { normalizeWhitespace: boolean; disableCombineTextItems: boolean }) => Promise<{ items: { str: string; hasEOL?: boolean }[] }>;
    }) => {
      const content = await pageData.getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: true,
      });
      const text = content.items
        .map((it) => it.str + (it.hasEOL ? "\n" : ""))
        .join("|");
      pages.push(text);
      return text;
    },
  });
  return pages;
}

async function extractInvoiceFromPages(pages: string[]): Promise<InvoiceExtractionResult> {
  const allText = pages.join("\n");
  let merged: InvoiceExtractionResult;

  // Single chunk? Just do one call.
  if (pages.length <= PAGES_PER_CHUNK) {
    merged = await callClaudeWithText(pages.join("\n"));
  } else {
    // Split into N parallel chunks of PAGES_PER_CHUNK pages each.
    const chunks: string[] = [];
    for (let i = 0; i < pages.length; i += PAGES_PER_CHUNK) {
      chunks.push(pages.slice(i, i + PAGES_PER_CHUNK).join("\n"));
    }

    const results = await Promise.all(chunks.map(callClaudeWithText));

    merged = {
      items: results.flatMap((r) => r.items),
      totalAmount: results.find((r) => r.totalAmount)?.totalAmount ?? 0,
      referenceMonth: results.find((r) => r.referenceMonth)?.referenceMonth ?? null,
      dueDate: results.find((r) => r.dueDate)?.dueDate ?? null,
      cardLastFour: results.find((r) => r.cardLastFour)?.cardLastFour ?? null,
      rawText: results.map((r) => r.rawText).join("\n---\n"),
    };
  }

  // Reconcile com créditos conhecidos do "Resumo da fatura" — a IA às vezes
  // perde estes em chunking. Determinístico: scaneia o texto cru do PDF
  // procurando padrões "(-) <valor><descrição>" e injeta se ausente.
  const injectedCredits = scanKnownCreditsFromText(allText);
  for (const credit of injectedCredits) {
    const dup = merged.items.some(
      (it) => Math.abs(Math.abs(it.amount) - Math.abs(credit.amount)) < 0.01,
    );
    if (!dup) merged.items.push(credit);
  }

  // Auto-balanceamento final: se mesmo após a injeção a soma dos itens
  // chargedThisMonth ainda divergir do totalAmount > R$ 1, cria UM item de
  // "Ajuste de reconciliação" com o sinal oposto pra fechar a conta.
  // Garante que o usuário nunca veja divergência — preserva a integridade
  // do total da fatura e permite investigar o ajuste manualmente.
  if (merged.totalAmount > 0) {
    const sumCharged = merged.items
      .filter((it) => it.chargedThisMonth !== false)
      .reduce((s, it) => s + it.amount, 0);
    const diff = sumCharged - merged.totalAmount;
    if (Math.abs(diff) > 1) {
      merged.items.push({
        date: merged.referenceMonth ? `${merged.referenceMonth}-01` : new Date().toISOString().slice(0, 10),
        description: "Ajuste de reconciliação (verifique itens da fatura)",
        amount: -diff,
        isCredit: diff > 0,
        establishment: null,
        installmentInfo: null,
        section: "Ajuste de reconciliação",
        chargedThisMonth: true,
        suggestedCategory: null,
      });
    }
  }

  return merged;
}

// Detecta créditos / pagamentos antecipados no "Resumo da fatura" via regex,
// pra garantir que entrem mesmo quando a IA não captura em chunking.
function scanKnownCreditsFromText(text: string): ExtractedInvoiceItem[] {
  const credits: ExtractedInvoiceItem[] = [];
  // Padrões: "(-) 90.105,41Pagamento antecipado" / "(-) 101,69Estornos / Crédito"
  // Também aceita "Pagamento antecipado(-) 90.105,41" (descrição antes do valor).
  const patterns = [
    /\(-\)\s*([\d.]+,\d{2})\s*(Pagamento antecipado|Estornos?\s*\/?\s*Cr[eé]dito[^\n]{0,40}|Valor remanescente[^\n]{0,60}|Cashback[^\n]{0,40})/gi,
    /(Pagamento antecipado|Estornos?\s*\/?\s*Cr[eé]dito[^\n]{0,40}|Valor remanescente[^\n]{0,60}|Cashback[^\n]{0,40})\s*\(-\)\s*([\d.]+,\d{2})/gi,
  ];
  const seen = new Set<string>();
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const [, a, b] = m;
      const isValueFirst = /^\d/.test(a);
      const valStr = (isValueFirst ? a : b).replace(/\./g, "").replace(",", ".");
      const desc = (isValueFirst ? b : a).trim().slice(0, 80);
      const amount = -Math.abs(parseFloat(valStr));
      if (Math.abs(amount) < 0.01) continue; // ignora "0,00"
      const key = `${desc}:${amount.toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      credits.push({
        date: new Date().toISOString().slice(0, 10),
        description: desc,
        amount,
        isCredit: true,
        establishment: null,
        installmentInfo: null,
        section: "Valores creditados",
        chargedThisMonth: true,
        suggestedCategory: null,
      });
    }
  }
  return credits;
}

async function callClaudeWithText(text: string): Promise<InvoiceExtractionResult> {
  const message = await retryWithBackoff(async () => {
    const stream = client.messages.stream({
      model: "claude-opus-4-7",
      max_tokens: 32000,
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

// Single-chunk vision call: manda 1 PDF (potencialmente fatiado) pro Opus.
async function extractInvoiceFromPdfVisionSingle(pdfBase64: string): Promise<InvoiceExtractionResult> {
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

// Fatura escaneada / sem texto embedido: fatia o PDF em chunks de PAGES_PER_CHUNK
// e processa em paralelo, mesmo padrão do path de texto. Necessário pra faturas
// grandes (30+ páginas) que ultrapassariam os 32k tokens de output do Opus.
async function extractInvoiceFromPdfVision(pdfBase64: string): Promise<InvoiceExtractionResult> {
  const { PDFDocument } = await import("pdf-lib");
  const srcBytes = Buffer.from(pdfBase64, "base64");
  const srcDoc = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
  const totalPages = srcDoc.getPageCount();

  if (totalPages <= PAGES_PER_CHUNK) {
    return extractInvoiceFromPdfVisionSingle(pdfBase64);
  }

  const chunks: string[] = [];
  for (let start = 0; start < totalPages; start += PAGES_PER_CHUNK) {
    const end = Math.min(start + PAGES_PER_CHUNK, totalPages);
    const subDoc = await PDFDocument.create();
    const pageIndices = Array.from({ length: end - start }, (_, i) => start + i);
    const pages = await subDoc.copyPages(srcDoc, pageIndices);
    pages.forEach((p) => subDoc.addPage(p));
    const chunkBytes = await subDoc.save();
    chunks.push(Buffer.from(chunkBytes).toString("base64"));
  }

  const results = await Promise.all(chunks.map(extractInvoiceFromPdfVisionSingle));

  return {
    items: results.flatMap((r) => r.items),
    totalAmount: results.find((r) => r.totalAmount)?.totalAmount ?? 0,
    referenceMonth: results.find((r) => r.referenceMonth)?.referenceMonth ?? null,
    dueDate: results.find((r) => r.dueDate)?.dueDate ?? null,
    cardLastFour: results.find((r) => r.cardLastFour)?.cardLastFour ?? null,
    rawText: results.map((r) => r.rawText).join("\n---\n"),
  };
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

// Descrições que SEMPRE são pagamento de fatura (não importa em que seção a IA colocou).
// Bancos costumam misturar pagamentos no meio dos lançamentos quando a fatura tem
// muitas páginas, e a IA chunked perde o contexto da seção. Por isso forçamos via
// pattern de descrição.
// Padrões que indicam pagamento da fatura ANTERIOR (não da atual).
// Esses NÃO contam no total deste mês — só aparecem como registro.
// CUIDADO: "pagamento antecipado" é DIFERENTE — é abatimento da fatura
// atual e DEVE entrar como crédito. Não listar "antecipado" aqui.
const PAYMENT_DESCRIPTION_PATTERNS = [
  /inclus[aã]o de pagamento/i,
  /^pagto\b/i,
  /pagamento (em|de|por|recebido|efetuado)/i,
  /pagamento eletr[oô]nico/i,
  /pagamento de fatura/i,
  /pagamento online/i,
  /\bpagto\.? por deb/i,  // PAGTO. POR DEB EM C/C (Bradesco)
];

// "Pagamento antecipado" / "antecipação de fatura" — abate da fatura ATUAL.
// Deve ser tratado como crédito do mês (chargedThisMonth=true, amount negativo).
const PREPAYMENT_DESCRIPTION_PATTERNS = [
  /pagamento antecipado/i,
  /antecipa[cç][aã]o de fatura/i,
  /antecipa[cç][aã]o de pagamento/i,
];

function isPaymentDescription(description: string): boolean {
  return PAYMENT_DESCRIPTION_PATTERNS.some((re) => re.test(description));
}

function isPrepaymentDescription(description: string): boolean {
  return PREPAYMENT_DESCRIPTION_PATTERNS.some((re) => re.test(description));
}

// Derive chargedThisMonth from section header. Patterns que indicam que o item
// NÃO entra no total deste mês: parcelas futuras, pagamentos da fatura anterior.
// Tudo o resto entra (lançamentos do período, encargos, créditos, IOF, etc).
function deriveChargedThisMonth(section: string | null): boolean {
  if (!section) return true; // sem info → otimista, deixa user revisar
  const s = section.toLowerCase();
  const futurePatterns = [
    "próxim",     // próximas faturas / próximas parcelas
    "proxim",
    "parcela",    // compras parceladas em aberto / parceladas em aberto
    "em aberto",
    "pagamento",  // "pagamento efetuado" / "pagamentos efetuados" / "pagto"
    "pagto",
    "futur",
    "histórico",
    "historico",
  ];
  return !futurePatterns.some((p) => s.includes(p));
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
  // Reescreve section/chargedThisMonth de forma determinística:
  // 1. Pagamento da fatura anterior ("Inclusao de Pagamento", "PAGTO POR DEB") →
  //    forçado pra "Pagamentos efetuados" + amount negativo (NÃO conta no total)
  // 2. Pagamento antecipado da fatura atual → "Valores creditados" + amount negativo
  //    (CONTA no total, como crédito)
  // 3. chargedThisMonth deriva da section (não confia no flag bruto da IA)
  const items = (p.items ?? []).map((it) => {
    let section = it.section ?? null;
    let amount = it.amount;
    if (isPrepaymentDescription(it.description)) {
      section = "Valores creditados";
      if (amount > 0) amount = -amount;
    } else if (isPaymentDescription(it.description)) {
      section = "Pagamentos efetuados";
      if (amount > 0) amount = -amount;
    }
    return {
      ...it,
      amount,
      section,
      chargedThisMonth: deriveChargedThisMonth(section),
    };
  });

  return {
    items,
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
