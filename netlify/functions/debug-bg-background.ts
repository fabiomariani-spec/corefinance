// Função background MÍNIMA pra diagnosticar — só atualiza o job no DB
// sem importar nada além do Prisma. Se isto não funcionar, o bundle do
// Prisma na BG fn tá quebrado.
import { prisma } from "../../lib/prisma";

export default async (req: Request) => {
  console.log("[debug-bg] handler invoked");
  try {
    const { jobId } = await req.json();
    console.log("[debug-bg] jobId=", jobId);
    if (!jobId) return new Response("missing jobId", { status: 400 });

    await prisma.invoiceJob.update({
      where: { id: jobId },
      data: { status: "READY", errorMessage: "debug bg fn ran ok", finishedAt: new Date() },
    });
    console.log("[debug-bg] DB updated");
    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("[debug-bg] error:", err);
    return new Response("err", { status: 500 });
  }
};
