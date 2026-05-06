// Quick test: post real C6 PDF to prod /api/invoices/upload
const fs = require("fs");

const SUPABASE_URL = "https://rqfdslnvojgasynuqbsq.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsImtpZCI6IllsRWxLcXVUSjhOcWdDOTQiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3JxZmRzbG52b2pnYXN5bnVxYnNxLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI5Mzk1YzRlNi0yYjQyLTQ4MWEtYTA0OC1jYmIwYmM2NDliYzYiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzgwMDAwMDAwLCJpYXQiOjE3NDAwMDAwMDB9.x";

async function main() {
  // 1. sign in
  const signInRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxZmRzbG52b2pnYXN5bnVxYnNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MjA4NzIsImV4cCI6MjA4OTA5Njg3Mn0.mwes6MrdvWGTyArKpxS9sUh6sG-mjeoQvk-M-roNQHw",
    },
    body: JSON.stringify({
      email: "jcgamer2014@gmail.com",
      password: "Core@2026!",
    }),
  });
  if (!signInRes.ok) {
    console.error("signin failed", signInRes.status, await signInRes.text());
    process.exit(1);
  }
  const session = await signInRes.json();
  const { access_token, refresh_token, expires_in, expires_at, token_type, user } = session;

  // Build supabase auth cookie (base64 JSON)
  const cookieVal = {
    access_token,
    refresh_token,
    expires_in,
    expires_at,
    token_type,
    user,
  };
  const cookie = `sb-rqfdslnvojgasynuqbsq-auth-token=base64-${Buffer.from(
    JSON.stringify(cookieVal)
  ).toString("base64")}`;

  // 2. build FormData
  const pdf = fs.readFileSync("/tmp/fatura.pdf");
  const blob = new Blob([pdf], { type: "application/pdf" });
  const form = new FormData();
  form.append("file", blob, "Cartao_C6_Elias.pdf");
  form.append("creditCardId", "cmmuwxujp0000b6v9dkfgl62c");

  const t0 = Date.now();
  const res = await fetch("https://finance.corestudio.ai/api/invoices/upload", {
    method: "POST",
    body: form,
    headers: { Cookie: cookie },
  });
  const ms = Date.now() - t0;
  console.log("STATUS:", res.status, "TIME:", ms + "ms", "CT:", res.headers.get("content-type"));
  const text = await res.text();
  if (res.ok) {
    let json;
    try { json = JSON.parse(text); } catch {
      console.log("NON-JSON BODY (first 600 chars):", text.slice(0, 600));
      process.exit(1);
    }
    if (json.error) {
      console.log("ERROR FROM API:", json.error);
      process.exit(1);
    }
    console.log("ITEMS:", json.items.length);
    console.log("TOTAL:", json.totalAmount);
    console.log("CARD:", json.cardLastFour, "DUE:", json.dueDate, "REF:", json.referenceMonth);
    console.log("---FIRST 5---");
    json.items.slice(0, 5).forEach((it, i) => {
      console.log(
        `${i + 1}. ${it.date} | ${it.description.slice(0, 40).padEnd(40)} | R$ ${it.amount}${it.isCredit ? " [CRED]" : ""}`
      );
    });
    console.log("---LAST 3---");
    json.items.slice(-3).forEach((it, i) => {
      console.log(
        `  ${it.date} | ${it.description.slice(0, 40).padEnd(40)} | R$ ${it.amount}${it.isCredit ? " [CRED]" : ""}`
      );
    });
  } else {
    console.log("BODY:", text.slice(0, 500));
  }
}
main().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
