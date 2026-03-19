import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

    const body = await request.json();
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
    } = body;

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

    const transaction = await prisma.transaction.create({
      data: {
        companyId,
        description,
        amount: Number(amount),
        type: "INCOME",
        status: status === "RECEIVED" ? "RECEIVED" : "PENDING",
        isPredicted: false,
        isRecurring: false,
        categoryId,
        departmentId,
        contactId,
        competenceDate: competenceDate ? new Date(competenceDate + "T12:00:00") : new Date(),
        dueDate: dueDate ? new Date(dueDate + "T12:00:00") : null,
        paymentDate: status === "RECEIVED" ? new Date() : null,
        tags,
        notes: notes || null,
      },
    });

    return NextResponse.json({ ok: true, transactionId: transaction.id }, { status: 201 });
  } catch (error) {
    console.error("Webhook revenue error:", error);
    return NextResponse.json({ error: "Erro interno", detail: String(error) }, { status: 500 });
  }
}
