import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Proxy (antigo middleware no Next ≤ 15): refresh da sessão Supabase pra
 * manter cookies fresh em todas as requisições. Sem RBAC aqui — gating de
 * navegação acontece na Sidebar (cliente) via prop role passada do layout.
 */
async function proxy(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value, options } of toSet) {
            res.cookies.set(name, value, options);
          }
        },
      },
    }
  );
  await supabase.auth.getUser();

  return res;
}

export { proxy };
export default proxy;

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
