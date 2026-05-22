// Testa CRUD ponta-a-ponta em prod via Prisma direto (bypassa auth).
// Cria, lê, atualiza, deleta um registro de cada recurso novo.
// Limpa tudo no final.

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

let pass = 0, fail = 0;
const fails = [];
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    pass++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    fail++;
    fails.push({ name, error: e.message });
  }
}

// Pega companyId de algum cartão existente
const card = await prisma.creditCard.findFirst({ select: { id: true, companyId: true } });
const companyId = card.companyId;
const creditCardId = card.id;
console.log(`\nUsando companyId=${companyId.slice(0,8)}...\n`);

// ===== CONTATOS =====
console.log("=== Contatos CRUD ===");
let contactId = null;
await test("Create contact", async () => {
  const c = await prisma.contact.create({
    data: { companyId, name: "Teste E2E " + Date.now(), type: "CLIENT" },
  });
  contactId = c.id;
});
await test("Read contact", async () => {
  const c = await prisma.contact.findFirst({ where: { id: contactId } });
  if (!c) throw new Error("contato não encontrado");
});
await test("Update contact", async () => {
  await prisma.contact.update({ where: { id: contactId }, data: { name: "Teste Atualizado" } });
  const c = await prisma.contact.findFirst({ where: { id: contactId } });
  if (c.name !== "Teste Atualizado") throw new Error("update não aplicou");
});
await test("Delete contact", async () => {
  await prisma.contact.delete({ where: { id: contactId } });
  const c = await prisma.contact.findFirst({ where: { id: contactId } });
  if (c) throw new Error("contato não foi deletado");
});

// ===== INVOICES =====
console.log("\n=== Faturas CRUD ===");
let invoiceId = null;
await test("Create invoice", async () => {
  const inv = await prisma.creditCardInvoice.create({
    data: {
      companyId, creditCardId,
      referenceMonth: 202612,
      closingDate: new Date("2026-12-15"),
      dueDate: new Date("2026-12-22"),
      totalAmount: 1234.56,
      status: "CLOSED",
    },
  });
  invoiceId = inv.id;
});
await test("Read invoice", async () => {
  const inv = await prisma.creditCardInvoice.findFirst({ where: { id: invoiceId } });
  if (!inv || Number(inv.totalAmount) !== 1234.56) throw new Error("dados inconsistentes");
});
await test("Update invoice status", async () => {
  await prisma.creditCardInvoice.update({ where: { id: invoiceId }, data: { status: "PAID" } });
  const inv = await prisma.creditCardInvoice.findFirst({ where: { id: invoiceId } });
  if (inv.status !== "PAID") throw new Error("status não atualizou");
});
await test("Delete invoice", async () => {
  await prisma.creditCardInvoice.delete({ where: { id: invoiceId } });
  const inv = await prisma.creditCardInvoice.findFirst({ where: { id: invoiceId } });
  if (inv) throw new Error("invoice não deletada");
});

// ===== CATEGORIES =====
console.log("\n=== Categorias CRUD (incluindo PUT) ===");
let catId = null;
await test("Create category", async () => {
  const c = await prisma.category.create({
    data: { companyId, name: "Teste Cat " + Date.now(), type: "EXPENSE", color: "#FF0000" },
  });
  catId = c.id;
});
await test("Update category", async () => {
  await prisma.category.update({ where: { id: catId }, data: { color: "#00FF00", name: "Atualizada" } });
  const c = await prisma.category.findFirst({ where: { id: catId } });
  if (c.color !== "#00FF00" || c.name !== "Atualizada") throw new Error("update incompleto");
});
await test("Delete category", async () => {
  await prisma.category.delete({ where: { id: catId } });
});

// ===== InvoiceJob (já tava testando antes, sanity) =====
console.log("\n=== InvoiceJob (sanity check) ===");
await test("InvoiceJob model exists", async () => {
  const count = await prisma.invoiceJob.count();
  console.log(`     (${count} jobs no DB)`);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("\nFalhas:");
  for (const f of fails) console.log(`  - ${f.name}: ${f.error}`);
  process.exit(1);
}
await prisma.$disconnect();
