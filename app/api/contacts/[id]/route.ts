import { NextResponse } from "next/server";
import { ContactType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-handler";

const VALID_TYPES: ContactType[] = ["SUPPLIER", "CLIENT", "BOTH"];

function isValidType(value: unknown): value is ContactType {
  return typeof value === "string" && (VALID_TYPES as string[]).includes(value);
}

export const GET = withAuth<{ id: string }>(async ({ companyId, params }) => {
  const contact = await prisma.contact.findFirst({
    where: { id: params.id, companyId },
    include: {
      _count: { select: { transactions: true, eventItems: true } },
    },
  });

  if (!contact) {
    return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });
  }

  return contact;
});

export const PATCH = withAuth<{ id: string }>(async ({ companyId, params, req }) => {
  const body = await req.json();

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, companyId },
  });

  if (!contact) {
    return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (typeof body.name === "string") {
    const trimmed = body.name.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "Nome não pode ser vazio" }, { status: 400 });
    }
    data.name = trimmed;
  }
  if (body.type !== undefined) {
    if (!isValidType(body.type)) {
      return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
    }
    data.type = body.type;
  }
  if (body.document !== undefined) {
    data.document =
      typeof body.document === "string" && body.document.trim()
        ? body.document.trim()
        : null;
  }
  if (body.email !== undefined) {
    data.email =
      typeof body.email === "string" && body.email.trim()
        ? body.email.trim()
        : null;
  }
  if (body.phone !== undefined) {
    data.phone =
      typeof body.phone === "string" && body.phone.trim()
        ? body.phone.trim()
        : null;
  }
  if (typeof body.isActive === "boolean") {
    data.isActive = body.isActive;
  }

  const updated = await prisma.contact.update({
    where: { id: params.id },
    data,
  });

  return updated;
}, { errorMsg: "Erro ao atualizar contato" });

export const DELETE = withAuth<{ id: string }>(async ({ companyId, params, req }) => {
  const contact = await prisma.contact.findFirst({
    where: { id: params.id, companyId },
    include: {
      _count: { select: { transactions: true, eventItems: true } },
    },
  });

  if (!contact) {
    return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });
  }

  const totalLinks = contact._count.transactions + contact._count.eventItems;

  // Se há vínculos, oferecemos soft-delete (desativar) ao invés de hard delete.
  // ?force=1 + sem vínculos → hard delete real. Com vínculos retorna 409.
  if (totalLinks > 0) {
    const archive = req.nextUrl.searchParams.get("archive") === "1";

    if (archive) {
      await prisma.contact.update({
        where: { id: params.id },
        data: { isActive: false },
      });
      return { ok: true, archived: true };
    }

    return NextResponse.json(
      {
        error:
          "Contato possui lançamentos ou itens de evento vinculados. Arquive em vez de excluir.",
        linkedTransactions: contact._count.transactions,
        linkedEventItems: contact._count.eventItems,
      },
      { status: 409 }
    );
  }

  await prisma.contact.delete({ where: { id: params.id } });
  return { ok: true, archived: false };
}, { errorMsg: "Erro ao excluir contato" });
