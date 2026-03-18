// ─── Z-API WhatsApp Client ────────────────────────────────────────────────────
// Docs: https://developer.z-api.io/

const ZAPI_BASE = `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}`;

export async function sendWhatsAppMessage(phone: string, message: string): Promise<void> {
  const res = await fetch(`${ZAPI_BASE}/send-text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Token": process.env.ZAPI_CLIENT_TOKEN ?? "",
    },
    body: JSON.stringify({ phone, message }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[WhatsApp] Falha ao enviar para ${phone}:`, text);
    throw new Error(`WhatsApp send failed: ${res.status}`);
  }
}

// Split long messages (WhatsApp has a ~4096 char limit)
export async function sendWhatsAppLongMessage(phone: string, message: string): Promise<void> {
  const MAX = 3800;
  if (message.length <= MAX) {
    return sendWhatsAppMessage(phone, message);
  }

  const chunks: string[] = [];
  let current = message;
  while (current.length > MAX) {
    // Split at last newline before MAX
    const splitAt = current.lastIndexOf("\n", MAX);
    const pos = splitAt > 0 ? splitAt : MAX;
    chunks.push(current.slice(0, pos));
    current = current.slice(pos).trimStart();
  }
  if (current) chunks.push(current);

  for (const chunk of chunks) {
    await sendWhatsAppMessage(phone, chunk);
    // Small delay between chunks
    await new Promise((r) => setTimeout(r, 500));
  }
}

// ─── Webhook payload parser ───────────────────────────────────────────────────

export interface WhatsAppIncoming {
  phone: string;
  senderName: string;
  message: string;
}

export function parseWebhookPayload(body: unknown): WhatsAppIncoming | null {
  try {
    const b = body as Record<string, unknown>;

    // Ignore messages sent by the bot itself
    if (b.fromMe === true) return null;

    // Z-API type filter — only text messages
    if (b.type !== "ReceivedCallback") return null;

    const phone = b.phone as string;
    const senderName = (b.senderName as string) ?? (b.chatName as string) ?? "Usuário";
    const text = b.text as Record<string, unknown> | undefined;
    const message = (text?.message as string)?.trim();

    if (!phone || !message) return null;

    return { phone, senderName, message };
  } catch {
    return null;
  }
}

// ─── Authorized numbers check ─────────────────────────────────────────────────

export function isAuthorized(phone: string): boolean {
  const authorized = process.env.WHATSAPP_AUTHORIZED_NUMBERS ?? "";
  if (!authorized) return false;
  const numbers = authorized.split(",").map((n) => n.trim().replace(/\D/g, ""));
  const cleaned = phone.replace(/\D/g, "");
  return numbers.some((n) => cleaned.endsWith(n) || n.endsWith(cleaned));
}

// ─── Admin number getter ──────────────────────────────────────────────────────

export function getAdminNumbers(): string[] {
  const nums = process.env.WHATSAPP_ADMIN_NUMBER ?? "";
  return nums
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
}
