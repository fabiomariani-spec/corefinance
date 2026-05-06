import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import PainelClient from "./painel-client";

/**
 * Server-component shell pra rota raiz `/`.
 *
 * Antes da renderização do painel, checa a role: usuário EVENTS_ONLY (Juan)
 * é redirecionado pra /eventos — única tela que ele tem acesso. Outros roles
 * caem direto no componente cliente do dashboard.
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (user) {
    const cu = await prisma.companyUser.findFirst({
      where: { userId: user.id, isActive: true },
      select: { role: true },
    });
    if (cu?.role === "EVENTS_ONLY") redirect("/eventos");
  }
  return <PainelClient />;
}
