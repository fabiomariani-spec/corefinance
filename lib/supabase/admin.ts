import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Admin client com `service_role` — bypassa RLS e habilita `auth.admin.*`.
 * Use SOMENTE em rotas server-side. Nunca exponha no browser.
 */
let cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_URL ausente no env");
  }

  cached = createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

/**
 * Procura um usuário autenticado pelo e-mail (case-insensitive).
 * Retorna `null` se não existir. Paginado caso o tenant tenha muitos usuários.
 */
export async function findAuthUserByEmail(email: string): Promise<{ id: string; email: string; name?: string } | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const admin = createAdminClient();

  // listUsers retorna no máx 1000 por página; paginamos até encontrar ou esgotar.
  const PER_PAGE = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) {
      console.error("admin.listUsers error:", error);
      return null;
    }
    const users = data?.users ?? [];
    const match = users.find((u) => (u.email ?? "").toLowerCase() === normalized);
    if (match) {
      const metaName = (match.user_metadata as Record<string, unknown> | null)?.["name"];
      return {
        id: match.id,
        email: match.email ?? normalized,
        name: typeof metaName === "string" ? metaName : undefined,
      };
    }
    if (users.length < PER_PAGE) break; // última página
  }
  return null;
}
