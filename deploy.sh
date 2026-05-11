#!/usr/bin/env bash
# Deploy manual pra produção (finance.corestudio.ai).
#
# Por que existe: a integração GitHub -> Netlify do repo está quebrada
# desde 2026-05-07 (deploy key SSH sem acesso). Enquanto o Fábio não
# reconecta o app do Netlify em https://github.com/settings/installations,
# pushes em main NÃO disparam build automático. Use este script.
#
# Pré-requisitos:
#   - .env.local presente (DATABASE_URL, ANTHROPIC_API_KEY, SUPABASE_*)
#   - logado no Netlify CLI (npx netlify-cli login)
#   - site linkado (id 36fe7dab-2386-4568-9d6d-35da8cfbb531)

set -euo pipefail

echo "==> prisma generate"
npx prisma generate

echo "==> next build"
npm run build

echo "==> netlify deploy --prod"
npx -y netlify-cli@latest deploy --prod --dir=.next

echo "==> done. confere https://finance.corestudio.ai"
