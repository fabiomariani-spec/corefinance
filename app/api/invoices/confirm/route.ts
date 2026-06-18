import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-handler";
import { parseBRDate } from "@/lib/dates";
import type { Prisma } from "@prisma/client";

// Confirm pode demorar pra fatura com 500+ itens. Bumpa pra 240s.
export const maxDuration = 240;

interface ConfirmItem {
  date: string;
  description: string;
  amount: number;
  establishment: string | null;
  installmentInfo: string | null;
  categoryId: string | null;
  departmentId: string | null;
  include: boolean;
}

export const POST = withAuth(async ({ companyId, req }) => {
  const body = await req.json();

  const {
    creditCardId,
    referenceMonth,
    dueDate,
    paymentDate,
    totalAmount,
    items,
    summaryOnly,
    summaryCategoryId,
    confirmAnyway,
  }: {
    creditCardId: string;
    referenceMonth: string;
    dueDate: string;
    paymentDate: string | null;
    totalAmount: number;
    items: ConfirmItem[];
    summaryOnly?: boolean;
    summaryCategoryId?: string | null;
    confirmAnyway?: boolean;
  } = body;

  // Parse reference month YYYY-MM → YYYYMM
  const refMonthInt = parseInt(referenceMonth.replace("-", ""));

  // ── Revalidação SERVER-SIDE da conciliação ──────────────────────────────
  // A trava da tela de import é client-side e pode ser burlada (retry, API
  // direta). Aqui é a rede de segurança real: a soma dos itens incluídos TEM
  // que bater com o total impresso no centavo, salvo ciência explícita
  // (confirmAnyway). Não se aplica ao modo summaryOnly (1 transação = total).
  if (!summaryOnly && !confirmAnyway && totalAmount > 0) {
    const includedSum = (items ?? [])
      .filter((it) => it.include)
      .reduce((s, it) => s + it.amount, 0);
    if (Math.abs(includedSum - totalAmount) > 0.01) {
      return NextResponse.json(
        {
          error: `Conciliação falhou: a soma dos itens selecionados (R$ ${includedSum.toFixed(2)}) não bate com o total da fatura (R$ ${totalAmount.toFixed(2)}). Revise os itens ou confirme ciente da diferença.`,
          reconciliation: { includedSum, totalAmount, diff: Number((includedSum - totalAmount).toFixed(2)) },
        },
        { status: 400 },
      );
    }
  }

  // Serializa confirms concorrentes da MESMA fatura. Sem isso, dois cliques no
  // botão (ou retry da rede) rodam o batch em paralelo, cada um lê o banco
  // antes do outro commitar e gera duplicatas. pg_advisory_xact_lock libera
  // automaticamente no COMMIT. Em PgBouncer transaction mode, só lock
  // xact-level funciona — daí o $transaction envolvendo todo o trabalho.
  const lockKey = `invoice-confirm:${companyId}:${creditCardId}:${refMonthInt}`;

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const existingInvoice = await tx.creditCardInvoice.findFirst({
      where: { companyId, creditCardId, referenceMonth: refMonthInt },
    });

    let invoiceId: string;

    if (existingInvoice) {
      invoiceId = existingInvoice.id;
    } else {
      const invoice = await tx.creditCardInvoice.create({
        data: {
          companyId,
          creditCardId,
          referenceMonth: refMonthInt,
          // parseBRDate → meio-dia local: a fatura fica no mês certo em qualquer
          // fuso. new Date("2026-06-01") era UTC-midnight = 31/05 21h no BR,
          // jogando a fatura inteira no mês anterior.
          closingDate: parseBRDate(referenceMonth + "-01")!,
          dueDate: dueDate ? parseBRDate(dueDate)! : new Date(),
          totalAmount,
          status: "CLOSED",
          importedAt: new Date(),
          processedAt: new Date(),
        },
      });
      invoiceId = invoice.id;
    }

    // Substituição na reimportação: se a fatura já existia, remove os lançamentos
    // NÃO PAGOS da importação anterior antes de recriar — impede que reimportar a
    // MESMA fatura DOBRE os lançamentos (antes só acumulava). Os já pagos são
    // preservados (o dedupe abaixo evita recriá-los) pra não desfazer conciliação.
    if (existingInvoice) {
      await tx.transaction.deleteMany({
        where: { companyId, importedFromInvoiceId: invoiceId, paymentDate: null },
      });
    }

    // Modo "Importar só o total": cria UMA transação consolidada, ignora itens.
    if (summaryOnly) {
      const card = await tx.creditCard.findFirst({
        where: { id: creditCardId, companyId },
        select: { name: true },
      });
      const isPaid = !!paymentDate;
      const created = await tx.transaction.create({
        data: {
          companyId,
          description: `Fatura ${card?.name ?? "cartão"} ${referenceMonth}`,
          amount: totalAmount,
          type: "EXPENSE",
          status: isPaid ? "PAID" : "PENDING",
          categoryId: summaryCategoryId || null,
          creditCardId,
          competenceDate: parseBRDate(referenceMonth + "-01")!,
          dueDate: dueDate ? parseBRDate(dueDate)! : new Date(),
          paymentDate: paymentDate ? parseBRDate(paymentDate) : null,
          paymentMethod: "CREDIT_CARD",
          importedFromInvoiceId: invoiceId,
          importSource: "invoice_import_summary",
        },
      });
      return {
        invoiceId,
        transactionsCreated: 1,
        skippedDuplicates: 0,
        summaryTransactionId: created.id,
      };
    }

    // Create transactions for included items — em lote, não num for await
    const includedItems = items.filter((item) => item.include);
    const isPaid = !!paymentDate;
    const paymentDateParsed = paymentDate ? parseBRDate(paymentDate) : null;
    const dueDateParsed = parseBRDate(dueDate);

    // 1 query só: pega todas as transações já existentes desse cartão pra dedupe.
    // Limita aos últimos 90 dias pra não pegar histórico antigo.
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const existingTxs = await tx.transaction.findMany({
      where: {
        companyId,
        creditCardId,
        competenceDate: { gte: ninetyDaysAgo },
      },
      select: { description: true, amount: true, competenceDate: true },
    });
    // Index por chave determinística pra lookup O(1) em memória.
    const dupKey = (desc: string, amount: number, date: Date) =>
      `${desc.toLowerCase().trim()}|${amount.toFixed(2)}|${date.toISOString().slice(0, 10)}`;
    const existingKeys = new Set(
      existingTxs.map((t) => dupKey(t.description, Number(t.amount), t.competenceDate)),
    );

    // Monta payload completo, descartando duplicatas em memória.
    const toCreate: Prisma.TransactionCreateManyInput[] = [];
    let skipped = 0;
    for (const item of includedItems) {
      const competence = parseBRDate(item.date);
      if (!competence) continue;
      const description = item.establishment
        ? `${item.description} — ${item.establishment}`
        : item.description;
      const amount = Math.abs(item.amount);
      if (existingKeys.has(dupKey(description, amount, competence))) {
        skipped++;
        continue;
      }
      existingKeys.add(dupKey(description, amount, competence));

      const isCredit = item.amount < 0;
      const status = isCredit
        ? (isPaid ? "RECEIVED" : "PENDING")
        : (isPaid ? "PAID" : "PENDING");
      toCreate.push({
        companyId,
        description,
        amount,
        type: isCredit ? "INCOME" : "EXPENSE",
        status,
        categoryId: item.categoryId || null,
        departmentId: item.departmentId || null,
        creditCardId,
        competenceDate: competence,
        dueDate: dueDateParsed,
        paymentDate: paymentDateParsed,
        paymentMethod: "CREDIT_CARD",
        importedFromInvoiceId: invoiceId,
        importSource: "invoice_import",
        notes: item.installmentInfo ? `Parcela ${item.installmentInfo}` : null,
      });
    }

    // createMany: 1 query, milhares de linhas inseridas em uma transação.
    // skipDuplicates depende do unique index parcial
    // `transactions_invoice_import_dedupe` no banco (criado fora do schema
    // Prisma porque é parcial com LOWER(TRIM(description))). Sem ele,
    // skipDuplicates é no-op nessa coluna.
    let created = 0;
    if (toCreate.length > 0) {
      const result = await tx.transaction.createMany({
        data: toCreate,
        skipDuplicates: true,
      });
      created = result.count;
    }

    return {
      invoiceId,
      transactionsCreated: created,
      skippedDuplicates: skipped,
    };
  }, { timeout: 240_000, maxWait: 60_000 });
}, { errorMsg: "Erro ao confirmar importação" });
