#!/usr/bin/env bash
# Dispara deploy na Netlify do branch main.
# Build hook URL — público, mas só dispara build (não dá acesso a nada).
curl -X POST -d {} https://api.netlify.com/build_hooks/69fb69e7b999216ee0f48499 \
  && echo "✅ deploy disparado" \
  || echo "❌ falhou"
