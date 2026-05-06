import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";

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

/**
 * Retorna companyId + role + userId do usuário autenticado. Use em
 * rotas/layouts que precisam decidir o que mostrar/permitir baseado em role.
 */
export async function getCompanyContext(): Promise<{
  companyId: string;
  role: UserRole;
  userId: string;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const companyUser = await prisma.companyUser.findFirst({
    where: { userId: user.id, isActive: true },
    select: { companyId: true, role: true },
  });
  if (!companyUser) throw new Error("Empresa não encontrada");

  return { companyId: companyUser.companyId, role: companyUser.role, userId: user.id };
}

export async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");
  return user;
}
