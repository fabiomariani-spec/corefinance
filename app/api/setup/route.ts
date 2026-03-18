import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_CATEGORIES = [
  // Receitas
  { name: "Receita Recorrente", type: "INCOME", color: "#10b981" },
  { name: "Receita Avulsa", type: "INCOME", color: "#34d399" },
  { name: "Serviços Prestados", type: "INCOME", color: "#6ee7b7" },
  { name: "Comissões Recebidas", type: "INCOME", color: "#a7f3d0" },
  // Despesas - RH
  { name: "Folha de Pagamento", type: "EXPENSE", color: "#ef4444" },
  { name: "Comissões Pagas", type: "EXPENSE", color: "#f87171" },
  { name: "Benefícios", type: "EXPENSE", color: "#fca5a5" },
  { name: "Reembolsos", type: "EXPENSE", color: "#fecaca" },
  // Despesas - Marketing
  { name: "Tráfego Pago", type: "EXPENSE", color: "#f97316" },
  { name: "Agência / Freelancer", type: "EXPENSE", color: "#fb923c" },
  { name: "Ferramentas de Marketing", type: "EXPENSE", color: "#fdba74" },
  // Despesas - Tecnologia
  { name: "Softwares e SaaS", type: "EXPENSE", color: "#8b5cf6" },
  { name: "Infraestrutura / Cloud", type: "EXPENSE", color: "#a78bfa" },
  { name: "Domínio e Hospedagem", type: "EXPENSE", color: "#c4b5fd" },
  // Despesas - Operacional
  { name: "Aluguel e Imóveis", type: "EXPENSE", color: "#3b82f6" },
  { name: "Serviços de Terceiros", type: "EXPENSE", color: "#60a5fa" },
  { name: "Utilities (Luz, Água, Internet)", type: "EXPENSE", color: "#93c5fd" },
  { name: "Escritório", type: "EXPENSE", color: "#bfdbfe" },
  // Despesas - Financeiro
  { name: "Impostos e Taxas", type: "EXPENSE", color: "#ec4899" },
  { name: "Tarifas Bancárias", type: "EXPENSE", color: "#f472b6" },
  { name: "Juros e IOF", type: "EXPENSE", color: "#f9a8d4" },
  { name: "Cartão de Crédito", type: "EXPENSE", color: "#fbcfe8" },
  // Despesas - Administrativo
  { name: "Jurídico e Contábil", type: "EXPENSE", color: "#f59e0b" },
  { name: "Viagens e Transporte", type: "EXPENSE", color: "#fbbf24" },
  { name: "Alimentação", type: "EXPENSE", color: "#fcd34d" },
  { name: "Assinaturas", type: "EXPENSE", color: "#fde68a" },
  { name: "Outros", type: "EXPENSE", color: "#6b7280" },
];

const DEFAULT_DEPARTMENTS = [
  { name: "Marketing", code: "MKT", color: "#f97316" },
  { name: "Vendas", code: "VND", color: "#10b981" },
  { name: "Customer Success", code: "CS", color: "#3b82f6" },
  { name: "Tecnologia", code: "TEC", color: "#8b5cf6" },
  { name: "Produto", code: "PRD", color: "#ec4899" },
  { name: "Operações", code: "OPS", color: "#f59e0b" },
  { name: "Administrativo", code: "ADM", color: "#6b7280" },
  { name: "Financeiro", code: "FIN", color: "#14b8a6" },
  { name: "RH", code: "RH", color: "#ef4444" },
  { name: "Diretoria", code: "DIR", color: "#a855f7" },
];

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const { name, company, email } = body;

    // Check if company already exists for this user
    const existing = await prisma.companyUser.findFirst({
      where: { userId: user.id },
    });

    if (existing) {
      return NextResponse.json({ message: "Já configurado" }, { status: 200 });
    }

    // Create company with defaults
    const newCompany = await prisma.company.create({
      data: {
        name: company || "Minha Empresa",
        users: {
          create: {
            userId: user.id,
            name: name || email,
            email: user.email || email,
            role: "ADMIN",
          },
        },
        categories: {
          createMany: {
            data: DEFAULT_CATEGORIES.map((c) => ({
              ...c,
              type: c.type as "INCOME" | "EXPENSE",
              isDefault: true,
            })),
          },
        },
        departments: {
          createMany: {
            data: DEFAULT_DEPARTMENTS,
          },
        },
        accounts: {
          create: {
            name: "Conta Principal",
            type: "CHECKING",
            bank: "Banco Principal",
            color: "#6366f1",
          },
        },
      },
    });

    return NextResponse.json({ companyId: newCompany.id }, { status: 201 });
  } catch (error) {
    console.error("Setup error:", error);
    return NextResponse.json({ error: "Erro ao configurar" }, { status: 500 });
  }
}
