import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";
import { z } from "zod";

const transactionSchema = z.object({
  description: z.string().min(1),
  amount: z.number().positive(),
  type: z.enum(["INCOME", "EXPENSE"]),
  status: z.enum(["PENDING", "PREDICTED", "PAID", "RECEIVED", "OVERDUE", "CANCELLED"]).default("PENDING"),
  isPredicted: z.boolean().default(false),
  isRecurring: z.boolean().default(false),
  categoryId: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
  creditCardId: z.string().nullable().optional(),
  competenceDate: z.string(),
  dueDate: z.string().nullable().optional(),
  paymentDate: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  installmentNumber: z.number().nullable().optional(),
  installmentTotal: z.number().nullable().optional(),
  installmentGroupId: z.string().nullable().optional(),
  recurrenceRule: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  // Recurring helpers (stripped before DB save)
  recurringMonths: z.number().optional(),
  dueDayOfMonth: z.number().optional(),
  openEnded: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get("page") ?? "1");
    const limit = parseInt(searchParams.get("limit") ?? "50");
    const type = searchParams.get("type");
    const status = searchParams.get("status");
    const categoryId = searchParams.get("categoryId");
    const departmentId = searchParams.get("departmentId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const month = searchParams.get("month"); // "YYYY-MM"
    const search = searchParams.get("search");

    // ── Base where (without type/status) used for summary aggregates ──
    const baseWhere: Record<string, unknown> = { companyId };

    if (categoryId) baseWhere.categoryId = categoryId;
    if (departmentId) baseWhere.departmentId = departmentId;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dateFilter: any[] | null = month
      ? (() => {
          const [y, m] = month.split("-").map(Number);
          const gte = new Date(y, m - 1, 1);
          const lte = new Date(y, m, 0, 23, 59, 59);
          return [
            { dueDate: { gte, lte } },
            { dueDate: null, competenceDate: { gte, lte } },
          ];
        })()
      : (startDate || endDate)
        ? [
            { dueDate: { ...(startDate && { gte: new Date(startDate + "T00:00:00") }), ...(endDate && { lte: new Date(endDate + "T23:59:59") }) } },
            { dueDate: null, competenceDate: { ...(startDate && { gte: new Date(startDate + "T00:00:00") }), ...(endDate && { lte: new Date(endDate + "T23:59:59") }) } },
          ]
        : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const searchFilter: any[] | null = search
      ? [
          { description: { contains: search, mode: "insensitive" } },
          { category: { name: { contains: search, mode: "insensitive" } } },
          { department: { name: { contains: search, mode: "insensitive" } } },
          { contact: { name: { contains: search, mode: "insensitive" } } },
        ]
      : null;

    if (dateFilter && searchFilter) {
      baseWhere.AND = [{ OR: dateFilter }, { OR: searchFilter }];
    } else if (dateFilter) {
      baseWhere.OR = dateFilter;
    } else if (searchFilter) {
      baseWhere.OR = searchFilter;
    }

    // ── Full where including type/status for paginated table ──
    const where: Record<string, unknown> = { ...baseWhere };

    if (type) {
      // Support comma-separated types: "EXPENSE,INCOME"
      const types = type.split(",");
      where.type = types.length > 1 ? { in: types } : types[0];
    }
    if (status) {
      // Support comma-separated statuses: "PENDING,OVERDUE"
      const statuses = status.split(",");
      where.status = statuses.length > 1 ? { in: statuses } : statuses[0];
    }

    const pendingWhere = { ...baseWhere, type: "EXPENSE" as const, status: { in: ["PENDING", "OVERDUE"] as ("PENDING" | "OVERDUE")[] } };

    // Sequential queries to avoid pool exhaustion on serverless
    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, color: true } },
        department: { select: { id: true, name: true, color: true } },
        contact: { select: { id: true, name: true } },
        account: { select: { id: true, name: true } },
        creditCard: { select: { id: true, name: true } },
        attachments: { select: { id: true, name: true, url: true } },
      },
      orderBy: { competenceDate: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });
    const total = await prisma.transaction.count({ where });
    const pendingAgg = await prisma.transaction.aggregate({
      where: pendingWhere,
      _sum: { amount: true },
    });
    const paidAgg = await prisma.transaction.aggregate({
      where: { ...baseWhere, type: "EXPENSE", status: "PAID" },
      _sum: { amount: true },
    });
    const pendingByDeptRaw = await prisma.transaction.groupBy({
      by: ["departmentId"],
      where: pendingWhere,
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
    });

    // Fetch department details for the breakdown
    const deptIds = pendingByDeptRaw.map((r) => r.departmentId).filter(Boolean) as string[];
    const depts = deptIds.length > 0
      ? await prisma.department.findMany({
          where: { id: { in: deptIds } },
          select: { id: true, name: true, color: true },
        })
      : [];
    const deptMap = Object.fromEntries(depts.map((d) => [d.id, d]));

    const pendingByDepartment = pendingByDeptRaw.map((r) => ({
      departmentId: r.departmentId ?? null,
      name: r.departmentId ? (deptMap[r.departmentId]?.name ?? "Sem departamento") : "Sem departamento",
      color: r.departmentId ? (deptMap[r.departmentId]?.color ?? "#6366f1") : "#6b7280",
      amount: Number(r._sum.amount ?? 0),
    }));

    return NextResponse.json({
      transactions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      summary: {
        expensePending: Number(pendingAgg._sum.amount ?? 0),
        expensePaid: Number(paidAgg._sum.amount ?? 0),
        pendingByDepartment,
      },
    });
  } catch (error) {
    console.error("Get transactions error:", error);
    return NextResponse.json({ error: "Erro ao buscar lançamentos", detail: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const body = await request.json();
    const data = transactionSchema.parse(body);

    // Strip recurring helpers before saving
    const { recurringMonths, dueDayOfMonth, openEnded, ...txData } = data;

    // ── RECURRING: generate N monthly transactions ──
    if (data.isRecurring && (recurringMonths !== undefined || openEnded)) {
      // openEnded=true OR recurringMonths=0 → generate 120 months (10 years), no fixed total
      const isOpenEnded = openEnded === true || recurringMonths === 0;
      const months = isOpenEnded ? 120 : Math.min(recurringMonths ?? 12, 120);
      const dayOfMonth = Math.min(Math.max(dueDayOfMonth ?? 5, 1), 28);
      const groupId = crypto.randomUUID();
      const baseDate = new Date(data.competenceDate);

      const transactions = Array.from({ length: months }, (_, i) => {
        // competenceDate: first day of baseMonth + i months
        const competence = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, 1);
        // dueDate: dayOfMonth of same month
        const due = new Date(competence.getFullYear(), competence.getMonth(), dayOfMonth);
        return {
          ...txData,
          companyId,
          status: "PENDING" as const,
          competenceDate: competence,
          dueDate: due,
          paymentDate: null,
          isRecurring: true,
          recurrenceRule: isOpenEnded ? "MONTHLY_OPEN" : "MONTHLY",
          installmentGroupId: groupId,
          installmentNumber: i + 1,
          // installmentTotal=null for open-ended → no fixed count shown in UI
          installmentTotal: isOpenEnded ? null : months,
          paymentMethod: txData.paymentMethod as never ?? null,
        };
      });

      await prisma.transaction.createMany({ data: transactions });
      return NextResponse.json({ created: months, groupId, openEnded: isOpenEnded }, { status: 201 });
    }

    // ── SINGLE transaction ──
    const transaction = await prisma.transaction.create({
      data: {
        ...txData,
        companyId,
        // Store at local noon (T12:00:00) to avoid UTC midnight → wrong day in BR timezone
        competenceDate: new Date(txData.competenceDate + "T12:00:00"),
        dueDate: txData.dueDate ? new Date(txData.dueDate + "T12:00:00") : null,
        paymentDate: txData.paymentDate ? new Date(txData.paymentDate + "T12:00:00") : null,
        paymentMethod: txData.paymentMethod as never ?? null,
      },
      include: { category: true, department: true, contact: true, account: true, creditCard: true },
    });

    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    console.error("Create transaction error:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Erro ao criar lançamento" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const body = await request.json();
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "Nenhum ID fornecido" }, { status: 400 });
    }

    const result = await prisma.transaction.deleteMany({
      where: { id: { in: ids }, companyId },
    });

    return NextResponse.json({ deleted: result.count });
  } catch (error) {
    console.error("Bulk delete error:", error);
    return NextResponse.json({ error: "Erro ao excluir lançamentos" }, { status: 500 });
  }
}
