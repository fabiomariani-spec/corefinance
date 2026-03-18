import { NextRequest, NextResponse } from "next/server";
import { parseWebhookPayload, isAuthorized, sendWhatsAppMessage } from "@/lib/whatsapp";
import { processFinancialMessage } from "@/lib/ai-assistant";

export const maxDuration = 60; // Netlify/Vercel: keep function alive up to 60s

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const incoming = parseWebhookPayload(body);
    if (!incoming) {
      return NextResponse.json({ ok: true });
    }

    if (!isAuthorized(incoming.phone)) {
      console.warn(`[WhatsApp] Unauthorized: ${incoming.phone}`);
      return NextResponse.json({ ok: true });
    }

    const companyId = process.env.WHATSAPP_COMPANY_ID;
    if (!companyId) {
      console.error("[WhatsApp] WHATSAPP_COMPANY_ID not set");
      return NextResponse.json({ ok: true });
    }

    // Process synchronously — serverless function stays alive until we return
    try {
      const response = await processFinancialMessage(
        incoming.message,
        companyId,
        incoming.senderName
      );
      await sendWhatsAppMessage(incoming.phone, response);
    } catch (err) {
      console.error("[WhatsApp] Error processing:", err);
      try {
        await sendWhatsAppMessage(
          incoming.phone,
          "⚠️ Erro ao processar sua pergunta. Tente novamente em instantes."
        );
      } catch { /* ignore */ }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[WhatsApp Webhook] Error:", err);
    return NextResponse.json({ ok: true });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "CoreFinance WhatsApp Webhook",
    configured: !!process.env.WHATSAPP_COMPANY_ID,
  });
}
