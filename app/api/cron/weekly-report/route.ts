import { NextRequest, NextResponse } from "next/server";
import { buildWeeklyReport } from "@/lib/ai-assistant";
import { sendWhatsAppLongMessage, getAdminNumbers } from "@/lib/whatsapp";

// Triggered by Vercel Cron or scheduled-tasks every Monday at 8:00 AM BRT (11:00 UTC)
// vercel.json: { "path": "/api/cron/weekly-report", "schedule": "0 11 * * 1" }
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const companyId = process.env.WHATSAPP_COMPANY_ID;
  if (!companyId) {
    return NextResponse.json(
      { error: "WHATSAPP_COMPANY_ID not configured" },
      { status: 500 }
    );
  }

  const adminNumbers = getAdminNumbers();
  if (adminNumbers.length === 0) {
    return NextResponse.json(
      { error: "WHATSAPP_ADMIN_NUMBER not configured" },
      { status: 500 }
    );
  }

  try {
    const report = await buildWeeklyReport(companyId);

    const results = await Promise.allSettled(
      adminNumbers.map((phone) => sendWhatsAppLongMessage(phone, report))
    );

    const failed = results.filter((r) => r.status === "rejected").length;

    return NextResponse.json({
      ok: true,
      sent: adminNumbers.length - failed,
      failed,
      reportLength: report.length,
    });
  } catch (err) {
    console.error("[Cron Weekly] Error:", err);
    return NextResponse.json(
      { error: "Failed to send weekly report", detail: String(err) },
      { status: 500 }
    );
  }
}
