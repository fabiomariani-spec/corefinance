import { NextRequest } from "next/server";
import { Recusa } from "@/lib/mcp/nucleo";

/**
 * Chama um route handler de app/api por dentro, como o navegador chamaria.
 *
 * É o que mantém a paridade com a tela: a ação do MCP passa pelo MESMO código
 * (validação, regras de negócio, recorrência, folha, conciliação de fatura…).
 * A pessoa vem do contexto do MCP (lib/mcp/contexto.ts), não de cookie.
 *
 * Erro do app (4xx) vira Recusa 422 com a mensagem dele; 5xx vira 500.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (req: NextRequest, ctx: any) => Promise<Response>;

export async function chamar<T = unknown>(
  handler: Handler,
  opts: {
    metodo?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    caminho: string;
    query?: Record<string, unknown>;
    corpo?: unknown;
    form?: FormData;
    params?: Record<string, string>;
  }
): Promise<T> {
  const url = new URL(`http://core-finance.mcp${opts.caminho}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }

  const init: { method: string; body?: BodyInit; headers?: Record<string, string> } = {
    method: opts.metodo ?? "GET",
  };
  if (opts.form) init.body = opts.form;
  else if (opts.corpo !== undefined) {
    init.body = JSON.stringify(opts.corpo);
    init.headers = { "content-type": "application/json" };
  }

  const res = await handler(new NextRequest(url, init), { params: Promise.resolve(opts.params ?? {}) });
  const texto = await res.text();
  let dados: unknown = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    dados = texto;
  }

  if (res.status >= 400) {
    const corpo = (dados && typeof dados === "object" ? dados : {}) as Record<string, unknown>;
    const { error, ...resto } = corpo;
    const msg =
      typeof error === "string" ? error : error ? JSON.stringify(error) : `O Core Finance respondeu ${res.status}.`;
    throw new Recusa(msg, res.status >= 500 ? 500 : 422, Object.keys(resto).length ? resto : undefined);
  }
  return dados as T;
}
