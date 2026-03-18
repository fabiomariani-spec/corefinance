import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = { companyId };
    if (status && status !== "all") where.status = status;
    if (search) where.name = { contains: search, mode: "insensitive" };

    const events = await prisma.event.findMany({
      where,
      include: {
        department: { select: { id: true, name: true, color: true } },
        items: {
          select: { id: true, amount: true, status: true },
        },
      },
      orderBy: { startDate: "desc" },
    });

    // Calculate financial totals per event
    const enriched = events.map((ev) => {
      const activeItems = ev.items.filter((i) => !["CANCELLED", "REJECTED"].includes(i.status));
      const planned    = activeItems.reduce((s, i) => s + Number(i.amount), 0);
      const approved   = ev.items.filter((i) => ["INTEGRATED", "PAID"].includes(i.status)).reduce((s, i) => s + Number(i.amount), 0);
      const paid       = ev.items.filter((i) => i.status === "PAID").reduce((s, i) => s + Number(i.amount), 0);
      const pending    = ev.items.filter((i) => i.status === "PENDING_APPROVAL").reduce((s, i) => s + Number(i.amount), 0);
      const budget     = Number(ev.budget);
      return {
        ...ev,
        items: undefined,
        _count: { items: ev.items.length },
        totals: { budget, planned, approved, paid, pending, balance: budget - planned },
      };
    });

    return NextResponse.json(enriched);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Erro ao listar eventos" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const body = await request.json();

    if (!body.name || !body.startDate || body.budget === undefined) {
      return NextResponse.json({ error: "Nome, data inicial e budget são obrigatórios" }, { status: 400 });
    }

    const event = await prisma.event.create({
      data: {
        companyId,
        name: body.name,
        type: body.type || null,
        startDate: new Date(body.startDate),
        endDate: body.endDate ? new Date(body.endDate) : null,
        location: body.location || null,
        responsible: body.responsible || null,
        description: body.description || null,
        budget: body.budget,
        departmentId: body.departmentId || null,
        status: body.status || "PLANNING",
      },
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Erro ao criar evento" }, { status: 500 });
  }
}
