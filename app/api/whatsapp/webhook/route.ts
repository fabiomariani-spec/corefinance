import { NextRequest, NextResponse } from "next/server";
import { isAuthorized, sendWhatsAppMessage } from "@/lib/whatsapp";
import { processFinancialMessage } from "@/lib/ai-assistant";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("[WhatsApp Webhook] Payload:", JSON.stringify(body).slice(0, 1000));

    // Extract message from Z-API payload (flexible parsing)
    const b = body as Record<string, unknown>;

    // Skip messages from the bot itself
    if (b.fromMe === true) {
      console.log("[WhatsApp] Skipped: fromMe");
      return NextResponse.json({ ok: true });
    }

    // Skip non-text (images, audio, etc.)
    if (b.isGroup === true) {
      console.log("[WhatsApp] Skipped: group message");
      return NextResponse.json({ ok: true });
    }

    // Extract phone number
    const phone = (b.phone as string) || (b.from as string) || "";
    if (!phone) {
      console.log("[WhatsApp] Skipped: no phone number");
      return NextResponse.json({ ok: true });
    }

    // Extract text message — Z-API sends in multiple possible formats
    let message = "";
    if (b.text && typeof b.text === "object") {
      message = ((b.text as Record<string, unknown>).message as string) || "";
    } else if (typeof b.text === "string") {
      message = b.text;
    } else if (typeof b.body === "string") {
      message = b.body;
    } else if (typeof b.message === "string") {
      message = b.message;
    }
    message = message.trim();

    if (!message) {
      console.log("[WhatsApp] Skipped: no text message. Keys:", Object.keys(b).join(","));
      return NextResponse.json({ ok: true });
    }

    const senderName = (b.senderName as string) || (b.chatName as string) || (b.pushName as string) || "Usuário";
    console.log(`[WhatsApp] Message from ${phone} (${senderName}): "${message}"`);

    // Auth check
    if (!isAuthorized(phone)) {
      console.warn(`[WhatsApp] Unauthorized: ${phone}`);
      return NextResponse.json({ ok: true });
    }

    const companyId = process.env.WHATSAPP_COMPANY_ID;
    if (!companyId) {
      console.error("[WhatsApp] WHATSAPP_COMPANY_ID not set");
      return NextResponse.json({ ok: true });
    }

    // Process synchronously
    try {
      console.log("[WhatsApp] Processing with AI...");
      const response = await processFinancialMessage(message, companyId, senderName);
      console.log("[WhatsApp] AI response length:", response.length);
      await sendWhatsAppMessage(phone, response);
      console.log("[WhatsApp] Response sent successfully");
    } catch (err) {
      console.error("[WhatsApp] Error processing:", err);
      try {
        await sendWhatsAppMessage(phone, "⚠️ Erro ao processar sua pergunta. Tente novamente.");
      } catch { /* ignore */ }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[WhatsApp Webhook] Parse error:", err);
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
