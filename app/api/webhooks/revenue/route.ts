import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Webhook de receita (OnProfit / Kiwify / Hotmart-style + formato direto).
 *
 * Idempotente por `externalId` (= `order_<id>` da plataforma). O mesmo pedido
 * pode chegar várias vezes com status diferentes ao longo da vida dele:
 *
 *   PENDING/WAITING → cria lançamento PENDING (a receber)
 *   PAID/APPROVED   → cria RECEIVED, ou promove o PENDING existente
 *   REFUNDED/CANCELLED/CHARGEBACK → marca o existente como CANCELLED
 *                     (estorno); sem venda correspondente, NÃO cria receita
 *
 * Antes, qualquer status fora de PAID/APPROVED virava receita PENDING nova
 * (reembolso/cancelado entravam como "a receber") e um 2º evento do mesmo
 * pedido batia 409 sem atualizar nada.
 */

type FinStatus = "RECEIVED" | "CANCELLED" | "PENDING";

// Valores que a OnProfit (e plataformas do mesmo formato) mandam em `status`.
// Comparação é case-insensitive e ignora espaços/hífens.
const RECEIVED_STATUSES = new Set([
  "PAID", "APPROVED", "COMPLETED", "COMPLETE", "CONFIRMED", "AUTHORIZED", "RECEIVED",
]);
const CANCELLED_STATUSES = new Set([
  "REFUNDED", "REFUND", "PARTIALLY_REFUNDED", "PARTIAL_REFUND",
  "CHARGEBACK", "CHARGED_BACK", "CHARGEDBACK", "DISPUTE", "DISPUTED",
  "CANCELLED", "CANCELED", "VOIDED",
  "REFUSED", "DECLINED", "REJECTED", "FAILED", "EXPIRED",
]);

function normalizeStatus(raw: unknown): FinStatus {
  const s = String(raw ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (RECEIVED_STATUSES.has(s)) return "RECEIVED";
  if (CANCELLED_STATUSES.has(s)) return "CANCELLED";
  return "PENDING";
}

// Detect if payload is from a sales platform (Kiwify/Hotmart/Eduzz/OnProfit style)
function isPlatformPayload(body: Record<string, unknown>) {
  return body.object === "order" && body.product && body.price !== undefined;
}

// Normalize platform payload to our internal format
function normalizePlatform(body: Record<string, unknown>) {
  const product = body.product as { name?: string } | undefined;
  const customer = body.customer as { name?: string; lastname?: string; email?: string; phone?: string } | undefined;
  const offerName = body.offer_name as string | undefined;

  // Price is in centavos (9700 = R$ 97.00)
  const priceRaw = Number(body.price ?? body.offer_price ?? 0);
  const amount = priceRaw >= 100 ? priceRaw / 100 : priceRaw; // auto-detect cents vs reais

  const customerName = [customer?.name, customer?.lastname].filter(Boolean).join(" ").trim() || null;
  const purchaseDate = body.purchase_date
    ? String(body.purchase_date).slice(0, 10) // "2026-03-19 19:51:29" → "2026-03-19"
    : null;

  // Build notes with useful metadata
  const notes = [
    offerName ? `Oferta: ${offerName}` : null,
    body.payment_type ? `Pagamento: ${body.payment_type}` : null,
    customer?.email ? `Email: ${customer.email}` : null,
    customer?.phone ? `Tel: ${customer.phone}` : null,
    body.utm_source ? `UTM: ${body.utm_source}/${body.utm_medium}/${body.utm_campaign}` : null,
  ].filter(Boolean).join(" | ");

  return {
    description: product?.name ?? offerName ?? "Venda",
    amount,
    contactName: customerName,
    competenceDate: purchaseDate,
    dueDate: purchaseDate,
    status: body.status, // normalizado mais abaixo
    // Só deriva externalId quando há um id real do pedido. Sem isso, payloads
    // sem `id` viravam todos "order_undefined" e colavam vendas distintas numa
    // só. Com null, cada venda é gravada sem dedupe — perder receita é pior
    // que não deduplicar um retry raro.
    externalId: (body.id != null && String(body.id).trim() !== "") ? `order_${body.id}` : null,
    notes: notes || null,
    categoryName: null as string | null,
    departmentName: null as string | null,
  };
}

function todayBR() {
  return new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function appendNote(existing: string | null, extra: string) {
  return existing ? `${existing} | ${extra}` : extra;
}

/**
 * Aplica o novo status em cima de um lançamento já existente do mesmo pedido.
 * Nunca rebaixa RECEIVED → PENDING (retry atrasado de um evento antigo).
 */
async function applyTransition(
  existing: { id: string; status: string; notes: string | null },
  fin: FinStatus,
  rawStatus: unknown,
) {
  if (fin === "CANCELLED" && existing.status !== "CANCELLED") {
    await prisma.transaction.update({
      where: { id: existing.id },
      data: {
        status: "CANCELLED",
        paymentDate: null,
        notes: appendNote(existing.notes, `Estornado via webhook (${String(rawStatus ?? "").toUpperCase() || "CANCELLED"}) em ${todayBR()}`),
      },
    });
    return "cancelled" as const;
  }

  if (fin === "RECEIVED" && existing.status !== "RECEIVED" && existing.status !== "PAID") {
    await prisma.transaction.update({
      where: { id: existing.id },
      data: {
        status: "RECEIVED",
        paymentDate: new Date(),
        notes: appendNote(existing.notes, `Confirmado via webhook (${String(rawStatus ?? "").toUpperCase() || "PAID"}) em ${todayBR()}`),
      },
    });
    return "received" as const;
  }

  return "duplicate" as const;
}

export async function POST(request: NextRequest) {
  try {
    // Company from env (webhook doesn't have user session)
    const companyId = process.env.WHATSAPP_COMPANY_ID;
    if (!companyId) {
      return NextResponse.json({ error: "Company not configured" }, { status: 500 });
    }

    const rawBody = await request.json();

    // Normalize: detect platform payloads vs direct format
    const data = isPlatformPayload(rawBody) ? normalizePlatform(rawBody) : rawBody;

    const {
      description,
      amount,
      categoryName,
      departmentName,
      contactName,
      competenceDate,
      dueDate,
      status,
      notes,
    } = data;
    const externalId: string | null =
      data.externalId != null && String(data.externalId).trim() !== "" ? String(data.externalId) : null;

    const fin = normalizeStatus(status);

    // 1) Pedido já conhecido → transição de status (idempotente)
    if (externalId) {
      const existing = await prisma.transaction.findFirst({
        where: { companyId, OR: [{ externalId }, { tags: { has: `ext:${externalId}` } }] },
        select: { id: true, status: true, notes: true },
      });
      if (existing) {
        const action = await applyTransition(existing, fin, status);
        return NextResponse.json({ ok: true, action, transactionId: existing.id }, { status: 200 });
      }
    }

    // 2) Estorno/cancelamento de pedido que não temos → não vira receita
    if (fin === "CANCELLED") {
      console.warn("Webhook revenue: estorno/cancelamento sem venda correspondente", {
        externalId, status, description, amount,
      });
      return NextResponse.json(
        { ok: true, action: "ignored", reason: "estorno/cancelamento sem venda correspondente" },
        { status: 200 },
      );
    }

    if (!description || !amount || Number(amount) <= 0) {
      return NextResponse.json({ error: "description e amount (> 0) são obrigatórios" }, { status: 400 });
    }

    // Resolve category by name
    let categoryId: string | null = null;
    if (categoryName) {
      const cat = await prisma.category.findFirst({
        where: { companyId, name: { equals: categoryName, mode: "insensitive" }, type: "INCOME" },
      });
      if (cat) categoryId = cat.id;
    }

    // Resolve department by name
    let departmentId: string | null = null;
    if (departmentName) {
      const dept = await prisma.department.findFirst({
        where: { companyId, name: { equals: departmentName, mode: "insensitive" } },
      });
      if (dept) departmentId = dept.id;
    }

    // Resolve or create contact by name
    let contactId: string | null = null;
    if (contactName) {
      let contact = await prisma.contact.findFirst({
        where: { companyId, name: { equals: contactName, mode: "insensitive" } },
      });
      if (!contact) {
        contact = await prisma.contact.create({
          data: { companyId, name: contactName, type: "CLIENT" },
        });
      }
      contactId = contact.id;
    }

    const tags: string[] = [];
    if (externalId) tags.push(`ext:${externalId}`);

    const txStatus = fin === "RECEIVED" ? "RECEIVED" : "PENDING";

    // 3) Cria. O índice único (companyId, externalId) é quem garante que dois
    //    webhooks do mesmo pedido em paralelo não viram dois lançamentos: o
    //    segundo cai em P2002 e é tratado como transição em cima do primeiro.
    try {
      const transaction = await prisma.transaction.create({
        data: {
          companyId,
          description: String(description),
          amount: Number(amount),
          type: "INCOME",
          status: txStatus,
          isPredicted: false,
          isRecurring: false,
          categoryId,
          departmentId,
          contactId,
          competenceDate: competenceDate ? new Date(String(competenceDate).slice(0, 10) + "T12:00:00") : new Date(),
          dueDate: dueDate ? new Date(String(dueDate).slice(0, 10) + "T12:00:00") : null,
          paymentDate: txStatus === "RECEIVED" ? new Date() : null,
          externalId,
          tags,
          notes: notes ? String(notes) : null,
        },
      });
      return NextResponse.json({ ok: true, action: "created", transactionId: transaction.id }, { status: 201 });
    } catch (err) {
      const isUniqueViolation =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (!isUniqueViolation || !externalId) throw err;

      const existing = await prisma.transaction.findFirst({
        where: { companyId, externalId },
        select: { id: true, status: true, notes: true },
      });
      if (!existing) throw err;
      const action = await applyTransition(existing, fin, status);
      return NextResponse.json({ ok: true, action, transactionId: existing.id }, { status: 200 });
    }
  } catch (error) {
    console.error("Webhook revenue error:", error);
    return NextResponse.json({ error: "Erro interno", detail: String(error) }, { status: 500 });
  }
}
