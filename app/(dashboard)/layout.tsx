import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/sidebar";

const DEFAULT_CATEGORIES = [
  { name: "Receita Recorrente", type: "INCOME" as const, color: "#10b981" },
  { name: "Receita Avulsa", type: "INCOME" as const, color: "#34d399" },
  { name: "Serviços Prestados", type: "INCOME" as const, color: "#6ee7b7" },
  { name: "Comissões Recebidas", type: "INCOME" as const, color: "#a7f3d0" },
  { name: "Folha de Pagamento", type: "EXPENSE" as const, color: "#ef4444" },
  { name: "Comissões Pagas", type: "EXPENSE" as const, color: "#f87171" },
  { name: "Benefícios", type: "EXPENSE" as const, color: "#fca5a5" },
  { name: "Reembolsos", type: "EXPENSE" as const, color: "#fecaca" },
  { name: "Tráfego Pago", type: "EXPENSE" as const, color: "#f97316" },
  { name: "Agência / Freelancer", type: "EXPENSE" as const, color: "#fb923c" },
  { name: "Ferramentas de Marketing", type: "EXPENSE" as const, color: "#fdba74" },
  { name: "Softwares e SaaS", type: "EXPENSE" as const, color: "#8b5cf6" },
  { name: "Infraestrutura / Cloud", type: "EXPENSE" as const, color: "#a78bfa" },
  { name: "Domínio e Hospedagem", type: "EXPENSE" as const, color: "#c4b5fd" },
  { name: "Aluguel e Imóveis", type: "EXPENSE" as const, color: "#3b82f6" },
  { name: "Serviços de Terceiros", type: "EXPENSE" as const, color: "#60a5fa" },
  { name: "Utilities (Luz, Água, Internet)", type: "EXPENSE" as const, color: "#93c5fd" },
  { name: "Escritório", type: "EXPENSE" as const, color: "#bfdbfe" },
  { name: "Impostos e Taxas", type: "EXPENSE" as const, color: "#ec4899" },
  { name: "Tarifas Bancárias", type: "EXPENSE" as const, color: "#f472b6" },
  { name: "Juros e IOF", type: "EXPENSE" as const, color: "#f9a8d4" },
  { name: "Cartão de Crédito", type: "EXPENSE" as const, color: "#fbcfe8" },
  { name: "Jurídico e Contábil", type: "EXPENSE" as const, color: "#f59e0b" },
  { name: "Viagens e Transporte", type: "EXPENSE" as const, color: "#fbbf24" },
  { name: "Alimentação", type: "EXPENSE" as const, color: "#fcd34d" },
  { name: "Assinaturas", type: "EXPENSE" as const, color: "#fde68a" },
  { name: "Outros", type: "EXPENSE" as const, color: "#6b7280" },
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

async function ensureCompanySetup(userId: string, userEmail: string, metadata: Record<string, string>) {
  const existing = await prisma.companyUser.findFirst({ where: { userId } });
  if (existing) return;

  await prisma.company.create({
    data: {
      name: metadata?.company || "Minha Empresa",
      users: {
        create: {
          userId,
          name: metadata?.name || userEmail,
          email: userEmail,
          role: "ADMIN",
        },
      },
      categories: {
        createMany: {
          data: DEFAULT_CATEGORIES.map((c) => ({ ...c, isDefault: true })),
        },
      },
      departments: { createMany: { data: DEFAULT_DEPARTMENTS } },
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
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data?.user;
  } catch (err) {
    console.error("[Layout] Supabase auth error:", err);
    redirect("/login");
  }

  if (!user) {
    redirect("/login");
  }

  try {
    await ensureCompanySetup(
      user.id,
      user.email!,
      (user.user_metadata ?? {}) as Record<string, string>
    );
  } catch (err) {
    console.error("[Layout] ensureCompanySetup error:", err);
    // Don't crash — user likely already has a company
  }

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto flex flex-col">
        {children}
      </main>
    </div>
  );
}
