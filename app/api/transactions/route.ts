import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-handler";
import { searchTransactionIds } from "@/lib/search";
import { adjustToPreviousBusinessDay } from "@/lib/dates";
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
  employeeId: z.string().nullable().optional(),
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
  recurrenceFrequency: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(),
});

export const GET = withAuth(async ({ companyId, req }) => {
  const { searchParams } = req.nextUrl;

  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const type = searchParams.get("type");
  const status = searchParams.get("status");
  const categoryId = searchParams.get("categoryId");
  const departmentId = searchParams.get("departmentId");
  const employeeId = searchParams.get("employeeId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const month = searchParams.get("month"); // "YYYY-MM"
  const search = searchParams.get("search");
  const sortBy = searchParams.get("sortBy") ?? "competenceDate";
  const sortOrder = (searchParams.get("sortOrder") ?? "desc") as "asc" | "desc";

  // ── Base where (without type/status) used for summary aggregates ──
  const baseWhere: Record<string, unknown> = { companyId };

  if (categoryId) baseWhere.categoryId = categoryId;
  if (departmentId) baseWhere.departmentId = departmentId;
  if (employeeId) baseWhere.employeeId = employeeId;

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

  // Accent + case insensitive search via raw SQL translate() on all joined
  // tables (description, category, department, contact). Returns a list of
  // matching IDs which we then feed into Prisma as an `id IN (...)` filter.
  if (search) {
    const matchedIds = await searchTransactionIds(companyId, search);
    baseWhere.id = { in: matchedIds };
  }

  if (dateFilter) {
    baseWhere.OR = dateFilter;
  }

  // ── Full where including type/status for paginated table ──
  const where: Record<string, unknown> = { ...baseWhere };

  if (type) {
    const types = type.split(",");
    where.type = types.length > 1 ? { in: types } : types[0];
  }
  if (status) {
    const statuses = status.split(",");
    where.status = statuses.length > 1 ? { in: statuses } : statuses[0];
  }

  const pendingWhere = { ...baseWhere, type: "EXPENSE" as const, status: { in: ["PENDING", "OVERDUE"] as ("PENDING" | "OVERDUE")[] } };

  // Sort: aceita sortBy=employee|description|category|department|dueDate|paymentDate|status|amount|competenceDate
  // sortOrder=asc|desc.
  //
  // `nulls: "last"` em scalar fields mantém os null no fim em qualquer sentido
  // (senão o user clica "Vencimento" e vê todas as linhas sem data no topo).
  //
  // Em **relações** (employee/category/department) o Prisma 7 não aceita
  // `nulls` aninhado: a sintaxe `{ employee: { name: { sort, nulls } } }` dá
  // erro de runtime. Usamos um array de 2 critérios: primeiro ordenamos pelo
  // ID da relação (null vai pro fim com `nulls: "last"`), depois pelo nome.
  // Pra relações: simples — `{ employee: { name: sortOrder } }`. Postgres
  // default coloca NULLS LAST em ASC e NULLS FIRST em DESC. Aceita-se o
  // trade-off (não dá pra colocar nulls last em DESC com syntax aninhada
  // no Prisma 7 sem dar erro de runtime).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderBy: any = (() => {
    const nullsLast = { sort: sortOrder, nulls: "last" as const };
    switch (sortBy) {
      case "employee":     return { employee:   { name: sortOrder } };
      case "category":     return { category:   { name: sortOrder } };
      case "department":   return { department: { name: sortOrder } };
      case "description":  return { description: sortOrder };
      case "dueDate":      return { dueDate:    nullsLast };
      case "paymentDate":  return { paymentDate: nullsLast };
      case "status":       return { status:     sortOrder };
      case "amount":       return { amount:     sortOrder };
      case "competenceDate":
      default:             return { competenceDate: sortOrder };
    }
  })();

  // Pagamentos do dia — independente do filtro de período (sempre hoje).
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // ─── 9 queries em PARALELO via Promise.all ──────────────────────────────
  // Cada .aggregate é ~80-150ms incluindo roundtrip+parse. Em paralelo fica
  // limitado pela mais lenta. Os índices novos cobrem todos os WHEREs.
  const [
    transactions,
    total,
    pendingAgg,
    paidAgg,
    incomeReceivedAgg,
    incomePendingAgg,
    paidTodayExpenseAgg,
    paidTodayIncomeAgg,
    pendingByDeptRaw,
  ] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, color: true } },
        department: { select: { id: true, name: true, color: true } },
        contact: { select: { id: true, name: true } },
        account: { select: { id: true, name: true } },
        creditCard: { select: { id: true, name: true } },
        employee: { select: { id: true, name: true } },
        attachments: { select: { id: true, name: true, url: true } },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.aggregate({ where: pendingWhere, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { ...baseWhere, type: "EXPENSE", status: "PAID" }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { ...baseWhere, type: "INCOME", status: "RECEIVED" }, _sum: { amount: true }, _count: true }),
    prisma.transaction.aggregate({ where: { ...baseWhere, type: "INCOME", status: { in: ["PENDING", "OVERDUE"] } }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { companyId, type: "EXPENSE", status: "PAID", paymentDate: { gte: todayStart, lte: todayEnd } }, _sum: { amount: true }, _count: true }),
    prisma.transaction.aggregate({ where: { companyId, type: "INCOME", status: "RECEIVED", paymentDate: { gte: todayStart, lte: todayEnd } }, _sum: { amount: true }, _count: true }),
    prisma.transaction.groupBy({
      by: ["departmentId"],
      where: pendingWhere,
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
    }),
  ]);

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

  // Cache-Control: private (não compartilha entre usuários) + SWR de 30s.
  // Browser serve do cache em navegações back/forward, e revalida em
  // background. POST/DELETE invalidam via Cache: no-store no client.
  return NextResponse.json(
    {
      transactions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      summary: {
        expensePending: Number(pendingAgg._sum.amount ?? 0),
        expensePaid: Number(paidAgg._sum.amount ?? 0),
        incomeReceived: Number(incomeReceivedAgg._sum.amount ?? 0),
        incomeReceivedCount: incomeReceivedAgg._count,
        incomePending: Number(incomePendingAgg._sum.amount ?? 0),
        paidTodayExpense: Number(paidTodayExpenseAgg._sum.amount ?? 0),
        paidTodayExpenseCount: paidTodayExpenseAgg._count,
        paidTodayIncome: Number(paidTodayIncomeAgg._sum.amount ?? 0),
        paidTodayIncomeCount: paidTodayIncomeAgg._count,
        pendingByDepartment,
      },
    },
    {
      headers: {
        "Cache-Control": "private, max-age=10, stale-while-revalidate=60",
      },
    }
  );
}, { errorMsg: "Erro ao buscar lançamentos" });

export const POST = withAuth(async ({ companyId, req }) => {
  const body = await req.json();

  let data;
  try {
    data = transactionSchema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    throw error;
  }

  // Strip recurring helpers before saving
  const { recurringMonths, dueDayOfMonth, openEnded, recurrenceFrequency, ...txData } = data;

  // ── RECURRING: generate N transactions per frequency ──
  if (data.isRecurring && (recurringMonths !== undefined || openEnded)) {
    const isOpenEnded = openEnded === true || recurringMonths === 0;
    const freq = recurrenceFrequency ?? "MONTHLY";
    const groupId = crypto.randomUUID();

    // ── SEMANAL / QUINZENAL: intervalo fixo de dias a partir de uma âncora ──
    // Âncora = vencimento da 1ª parcela (ou competência, se vazio). Cada
    // ocorrência soma 7 (semanal) ou 14 (quinzenal) dias. `recurringMonths`
    // reaproveita o mesmo input numérico, mas representa Nº de ocorrências.
    if (freq === "WEEKLY" || freq === "BIWEEKLY") {
      const intervalDays = freq === "WEEKLY" ? 7 : 14;
      // Sem prazo: gera ~3 anos adiantado; com prazo, limita a um teto são.
      const maxCount = freq === "WEEKLY" ? 520 : 260;
      const defaultOpen = freq === "WEEKLY" ? 156 : 78;
      const count = isOpenEnded ? defaultOpen : Math.min(recurringMonths ?? 12, maxCount);
      // Meio-dia local pra evitar shift de UTC virar o dia anterior no BR.
      const anchorStr = (txData.dueDate ?? data.competenceDate).slice(0, 10);
      const anchor = new Date(anchorStr + "T12:00:00");

      const transactions = Array.from({ length: count }, (_, i) => {
        const occ = new Date(anchor);
        occ.setDate(occ.getDate() + i * intervalDays);
        // Se cair em fim de semana, antecipa pra sexta anterior.
        const due = adjustToPreviousBusinessDay(occ);
        return {
          ...txData,
          companyId,
          status: "PENDING" as const,
          competenceDate: occ,
          dueDate: due,
          paymentDate: null,
          isRecurring: true,
          recurrenceRule: isOpenEnded ? `${freq}_OPEN` : freq,
          installmentGroupId: groupId,
          installmentNumber: i + 1,
          installmentTotal: isOpenEnded ? null : count,
          paymentMethod: txData.paymentMethod as never ?? null,
        };
      });

      await prisma.transaction.createMany({ data: transactions });
      return NextResponse.json({ created: count, groupId, openEnded: isOpenEnded }, { status: 201 });
    }

    // ── MENSAL (padrão): uma transação por mês ──
    const months = isOpenEnded ? 120 : Math.min(recurringMonths ?? 12, 120);
    // Aceita 1-31. Em meses curtos (fev, abril etc) faz clamp pro último dia
    // do mês via `new Date(y, m+1, 0)` quando o dia escolhido excede o mês.
    const dayOfMonth = Math.min(Math.max(dueDayOfMonth ?? 5, 1), 31);
    const baseDate = new Date(data.competenceDate);

    const transactions = Array.from({ length: months }, (_, i) => {
      const competence = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, 1);
      // Último dia válido do mês corrente
      const lastDay = new Date(competence.getFullYear(), competence.getMonth() + 1, 0).getDate();
      const effectiveDay = Math.min(dayOfMonth, lastDay);
      const rawDue = new Date(competence.getFullYear(), competence.getMonth(), effectiveDay);
      // Se o vencimento cair em fim de semana, antecipa para sexta anterior
      // (regra do financeiro: nada pode vencer em sábado/domingo).
      const due = adjustToPreviousBusinessDay(rawDue);
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
}, { errorMsg: "Erro ao criar lançamento" });

export const DELETE = withAuth(async ({ companyId, req }) => {
  const body = await req.json();
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "Nenhum ID fornecido" }, { status: 400 });
  }

  const result = await prisma.transaction.deleteMany({
    where: { id: { in: ids }, companyId },
  });

  return { deleted: result.count };
}, { errorMsg: "Erro ao excluir lançamentos" });
