import { NextRequest, NextResponse } from "next/server";
import { parseWebhookPayload, isAuthorized, sendWhatsAppMessage } from "@/lib/whatsapp";
import { processFinancialMessage } from "@/lib/ai-assistant";

// Z-API will call this endpoint when a message arrives
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const incoming = parseWebhookPayload(body);
    if (!incoming) {
      // Silently ignore: fromMe, non-text, etc.
      return NextResponse.json({ ok: true });
    }

    // Security: only respond to authorized numbers
    if (!isAuthorized(incoming.phone)) {
      console.warn(`[WhatsApp] Unauthorized number: ${incoming.phone}`);
      return NextResponse.json({ ok: true }); // Don't reveal the rejection
    }

    const companyId = process.env.WHATSAPP_COMPANY_ID;
    if (!companyId) {
      console.error("[WhatsApp] WHATSAPP_COMPANY_ID not configured");
      return NextResponse.json({ error: "Not configured" }, { status: 500 });
    }

    // Send "typing" indicator via Z-API (optional, ignore if fails)
    // Respond asynchronously so Z-API doesn't timeout waiting
    // We process in background and return 200 immediately
    setImmediate(async () => {
      try {
        const response = await processFinancialMessage(
          incoming.message,
          companyId,
          incoming.senderName
        );
        await sendWhatsAppMessage(incoming.phone, response);
      } catch (err) {
        console.error("[WhatsApp] Error processing message:", err);
        try {
          await sendWhatsAppMessage(
            incoming.phone,
            "⚠️ Ocorreu um erro ao processar sua pergunta. Tente novamente em instantes."
          );
        } catch {
          // ignore secondary error
        }
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[WhatsApp Webhook] Error:", err);
    return NextResponse.json({ ok: true }); // Always return 200 to Z-API
  }
}

// GET: health check / webhook verification
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "CoreFinance WhatsApp Webhook",
    configured: !!process.env.WHATSAPP_COMPANY_ID,
  });
}
