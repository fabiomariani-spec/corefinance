-- MCP remoto (/mcp) e API REST (/api/v1) do Core Finance. Doc: docs/mcp.md
--
-- Cada token pertence a uma pessoa da equipe (company_users.id). O MCP roda as
-- mesmas rotas de app/api como essa pessoa: mesma empresa, mesmo papel. O token
-- puro só aparece uma vez (retorno de mcp_create_token); aqui fica só o sha256.
--
-- Aplicar uma vez no SQL Editor do Supabase (idempotente). Os modelos McpToken,
-- McpCall e SystemConfig no schema.prisma espelham estas tabelas.
--
-- Criar token:   select mcp_create_token('core-agents', 'email@da.pessoa', 'Core Agents (IA)', true);
--                (e-mail ou id do company_users; o retorno é o token, guarde na hora)
-- Revogar:       update mcp_tokens set active = false where name = 'core-agents';
-- Desligar a escrita de todos:
--                update system_config set value = '{"escrita": false}' where key = 'mcp_remoto';

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.mcp_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL,
  acting_user_id text NOT NULL,
  can_write boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at timestamptz(6),
  CONSTRAINT mcp_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT mcp_tokens_acting_user_id_fkey FOREIGN KEY (acting_user_id)
    REFERENCES public.company_users(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS mcp_tokens_name_key ON public.mcp_tokens (name);
CREATE UNIQUE INDEX IF NOT EXISTS mcp_tokens_key_hash_key ON public.mcp_tokens (key_hash);

-- Uma linha por ação chamada. canal = 'mcp' (POST /mcp) ou 'api' (/api/v1).
-- args com textos longos cortados em 500 caracteres (ex.: arquivo de fatura).
CREATE TABLE IF NOT EXISTS public.mcp_calls (
  id bigserial NOT NULL,
  token_id uuid NOT NULL,
  tool text NOT NULL,
  canal text NOT NULL,
  args jsonb,
  ok boolean NOT NULL,
  error text,
  ms integer,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT mcp_calls_pkey PRIMARY KEY (id),
  CONSTRAINT mcp_calls_token_id_fkey FOREIGN KEY (token_id)
    REFERENCES public.mcp_tokens(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT mcp_calls_canal_check CHECK (canal IN ('mcp', 'api'))
);
CREATE INDEX IF NOT EXISTS mcp_calls_token_id_created_at_idx ON public.mcp_calls (token_id, created_at DESC);

-- Chave geral: mcp_remoto.escrita=false deixa todos os tokens só de leitura.
CREATE TABLE IF NOT EXISTS public.system_config (
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT system_config_pkey PRIMARY KEY (key)
);
INSERT INTO public.system_config (key, value)
VALUES ('mcp_remoto', '{"escrita": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- O app acessa pelo Prisma (role postgres). Pela API do Supabase (anon /
-- authenticated) estas tabelas ficam fechadas.
ALTER TABLE public.mcp_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.mcp_tokens, public.mcp_calls, public.system_config FROM anon, authenticated;
  END IF;
END $$;

-- Cria o token de uma pessoa da equipe e devolve o texto puro (uma vez só).
-- p_pessoa = e-mail ou id de um company_users ativo. Se o e-mail aparece em
-- mais de um vínculo (outra empresa ou vínculo duplicado), use o id.
CREATE OR REPLACE FUNCTION public.mcp_create_token(
  p_name text,
  p_pessoa text,
  p_note text DEFAULT NULL,
  p_can_write boolean DEFAULT true,
  p_company_id text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_membro text;
  v_qtd int;
  v_key text := 'cf_mcp_' || encode(extensions.gen_random_bytes(24), 'hex');
BEGIN
  SELECT count(*), min(id) INTO v_qtd, v_membro
    FROM public.company_users
   WHERE (id = btrim(p_pessoa) OR lower(email) = lower(btrim(p_pessoa))) AND "isActive"
     AND (p_company_id IS NULL OR "companyId" = p_company_id);
  IF v_qtd = 0 THEN RAISE EXCEPTION 'pessoa da equipe não encontrada (ativa): %', p_pessoa; END IF;
  IF v_qtd > 1 THEN RAISE EXCEPTION '% tem % vínculos ativos: use o id do company_users', p_pessoa, v_qtd; END IF;
  INSERT INTO public.mcp_tokens (name, key_prefix, key_hash, acting_user_id, can_write, note)
  VALUES (p_name, 'cf_mcp_', encode(extensions.digest(v_key, 'sha256'), 'hex'), v_membro, p_can_write, p_note);
  RETURN v_key;
END $$;
REVOKE ALL ON FUNCTION public.mcp_create_token(text, text, text, boolean, text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.mcp_create_token(text, text, text, boolean, text) FROM anon, authenticated;
  END IF;
END $$;
