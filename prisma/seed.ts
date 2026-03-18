import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seed de dados iniciais concluído. Use o fluxo de registro para criar a primeira empresa.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
