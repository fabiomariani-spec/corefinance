import { NextRequest, NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth";

/**
 * Wrapper para rotas de API autenticadas.
 *
 * Cuida de:
 *  - Resolver companyId (retorna 401 se não autenticado)
 *  - Resolver params assíncronos do Next.js 16
 *  - Capturar exceções e retornar 500 com mensagem traduzida
 *
 * Uso:
 *   export const GET = withAuth<{ id: string }>(async ({ companyId, params }) => {
 *     const item = await prisma.x.findFirst({ where: { id: params.id, companyId } });
 *     if (!item) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
 *     return item; // auto-wrapped em NextResponse.json()
 *   });
 */

type AuthHandlerArgs<P> = {
  companyId: string;
  params: P;
  req: NextRequest;
};

type RouteContext<P> = { params: Promise<P> };

export function withAuth<P = Record<string, never>>(
  handler: (args: AuthHandlerArgs<P>) => Promise<unknown>,
  opts: { errorMsg?: string } = {}
) {
  return async (req: NextRequest, ctx?: RouteContext<P>): Promise<NextResponse> => {
    try {
      const companyId = await getCompanyId();
      const params = ctx?.params ? await ctx.params : ({} as P);
      const result = await handler({ companyId, params, req });
      if (result instanceof NextResponse) return result;
      return NextResponse.json(result);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes("autenticado")) {
          return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
        }
        if (err.message.includes("Empresa não")) {
          return NextResponse.json({ error: "Empresa não encontrada" }, { status: 403 });
        }
      }
      console.error("API error:", err);
      return NextResponse.json({ error: opts.errorMsg ?? "Erro" }, { status: 500 });
    }
  };
}
