import { NextResponse } from "next/server";
import { Prisma, ContactType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-handler";

const VALID_TYPES: ContactType[] = ["SUPPLIER", "CLIENT", "BOTH"];

function isValidType(value: unknown): value is ContactType {
  return typeof value === "string" && (VALID_TYPES as string[]).includes(value);
}

export const GET = withAuth(async ({ companyId, req }) => {
  const search = req.nextUrl.searchParams.get("search")?.trim() ?? "";
  const type = req.nextUrl.searchParams.get("type");
  const includeInactive = req.nextUrl.searchParams.get("includeInactive") === "1";

  const where: Prisma.ContactWhereInput = {
    companyId,
    ...(includeInactive ? {} : { isActive: true }),
    ...(isValidType(type) ? { type } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { document: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  return prisma.contact.findMany({
    where,
    include: {
      _count: { select: { transactions: true, eventItems: true } },
    },
    orderBy: { name: "asc" },
  });
});

export const POST = withAuth(async ({ companyId, req }) => {
  const body = await req.json();

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }

  const type: ContactType = isValidType(body.type) ? body.type : "BOTH";

  const contact = await prisma.contact.create({
    data: {
      companyId,
      name,
      type,
      document:
        typeof body.document === "string" && body.document.trim()
          ? body.document.trim()
          : null,
      email:
        typeof body.email === "string" && body.email.trim()
          ? body.email.trim()
          : null,
      phone:
        typeof body.phone === "string" && body.phone.trim()
          ? body.phone.trim()
          : null,
    },
  });

  return NextResponse.json(contact, { status: 201 });
}, { errorMsg: "Erro ao criar contato" });
