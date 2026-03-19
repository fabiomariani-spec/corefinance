import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Detect if payload is from a sales platform (Kiwify/Hotmart/Eduzz style)
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

  const status = body.status === "PAID" || body.status === "APPROVED" ? "RECEIVED" : "PENDING";

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
    status,
    externalId: `order_${body.id}`,
    notes: notes || null,
    categoryName: null as string | null,
    departmentName: null as string | null,
  };
}

export async function POST(request: NextRequest) {
  try {
    // Auth via secret header
    const secret = request.headers.get("x-webhook-secret");
    const expected = process.env.WEBHOOK_SECRET;
    if (!expected || secret !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
      externalId,
    } = data;

    if (!description || !amount || Number(amount) <= 0) {
      return NextResponse.json({ error: "description e amount (> 0) são obrigatórios" }, { status: 400 });
    }

    // Duplicate check via externalId
    if (externalId) {
      const existing = await prisma.transaction.findFirst({
        where: { companyId, tags: { has: `ext:${externalId}` } },
      });
      if (existing) {
        return NextResponse.json({ error: "Duplicado", transactionId: existing.id }, { status: 409 });
      }
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

    const txStatus = status === "RECEIVED" ? "RECEIVED" : "PENDING";

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
        tags,
        notes: notes ? String(notes) : null,
      },
    });

    return NextResponse.json({ ok: true, transactionId: transaction.id }, { status: 201 });
  } catch (error) {
    console.error("Webhook revenue error:", error);
    return NextResponse.json({ error: "Erro interno", detail: String(error) }, { status: 500 });
  }
}
