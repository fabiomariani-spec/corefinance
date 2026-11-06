import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";
import type { User } from "@supabase/supabase-js";
import { identidadeMcp } from "@/lib/mcp/contexto";

// Chamadas pelo MCP/API v1 (token cf_mcp_…) não têm cookie: a pessoa vem do
// token, já validado em lib/mcp/sessao.ts. Ver lib/mcp/contexto.ts.

export async function getCompanyId(): Promise<string> {
  const mcp = identidadeMcp();
  if (mcp) return mcp.companyId;

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
  const mcp = identidadeMcp();
  if (mcp) return { companyId: mcp.companyId, role: mcp.role, userId: mcp.userId };

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

export async function requireAuth(): Promise<User> {
  const mcp = identidadeMcp();
  if (mcp) return { id: mcp.userId, email: mcp.email } as User;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");
  return user;
}
