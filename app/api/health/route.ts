import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const checks: Record<string, unknown> = {
    env: {
      DATABASE_URL: !!process.env.DATABASE_URL,
      SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      WHATSAPP_COMPANY_ID: !!process.env.WHATSAPP_COMPANY_ID,
    },
  };

  try {
    const result = await prisma.$queryRawUnsafe("SELECT 1 as ok") as { ok: number }[];
    checks.db = { connected: true, result: result[0]?.ok };
  } catch (err) {
    checks.db = { connected: false, error: String(err).slice(0, 500) };
  }

  return NextResponse.json(checks);
}
