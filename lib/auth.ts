import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function getCompanyId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) throw new Error("Não autenticado");

  const companyUser = await prisma.companyUser.findFirst({
    where: { userId: user.id, isActive: true },
    select: { companyId: true },
  });

  if (!companyUser) throw new Error("Empresa não encontrada");

  return companyUser.companyId;
}

export async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");
  return user;
}
