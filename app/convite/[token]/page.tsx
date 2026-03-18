"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Wallet,
  Loader2,
  AlertCircle,
  CheckCircle,
  UserCheck,
  Building2,
  Crown,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface InviteInfo {
  email: string;
  role: string;
  roleLabel: string;
  invitedBy: string;
  companyName: string;
  expiresAt: string;
}

type PageState = "loading" | "invalid" | "ready" | "accepting" | "done";
type AuthMode = "login" | "register";

const ROLE_COLOR: Record<string, string> = {
  ADMIN: "text-indigo-400",
  MANAGER: "text-violet-400",
  ACCOUNTANT: "text-amber-400",
  VIEWER: "text-zinc-400",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ConvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [pageState, setPageState] = useState<PageState>("loading");
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [joinedCompany, setJoinedCompany] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // ── Load invite info ────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        // Check if already logged in
        const { data: { user } } = await supabase.auth.getUser();
        if (user) setIsLoggedIn(true);

        // Fetch invite details (public endpoint)
        const res = await fetch(`/api/team/invite/${token}`);
        if (!res.ok) {
          const data = await res.json();
          setErrorMsg(data.error ?? "Convite inválido");
          setPageState("invalid");
          return;
        }

        const info: InviteInfo = await res.json();
        setInviteInfo(info);
        setEmail(info.email); // pre-fill email
        setPageState("ready");
      } catch {
        setErrorMsg("Erro ao carregar convite. Tente novamente.");
        setPageState("invalid");
      }
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── Accept invite (user is already logged in) ────────────────────────────
  async function acceptInvite() {
    setPageState("accepting");
    const res = await fetch(`/api/team/invite/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();

    if (!res.ok) {
      setErrorMsg(data.error ?? "Erro ao aceitar convite");
      setPageState("ready");
      return;
    }
    setJoinedCompany(data.companyName);
    setPageState("done");
  }

  // ── Register + accept invite ─────────────────────────────────────────────
  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);

    try {
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });

      if (authError) {
        setFormError(authError.message);
        return;
      }

      // Accept invite — server will read the new session
      const res = await fetch(`/api/team/invite/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error ?? "Erro ao vincular à empresa");
        return;
      }
      setJoinedCompany(data.companyName);
      setPageState("done");
    } finally {
      setFormLoading(false);
    }
  }

  // ── Login + accept invite ────────────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setFormError("E-mail ou senha incorretos");
        return;
      }

      const res = await fetch(`/api/team/invite/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error ?? "Erro ao vincular à empresa");
        return;
      }
      setJoinedCompany(data.companyName);
      setPageState("done");
    } finally {
      setFormLoading(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (pageState === "loading") {
    return (
      <div className="relative z-10 flex flex-col items-center gap-3 text-zinc-500">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-sm">Carregando convite...</p>
      </div>
    );
  }

  if (pageState === "invalid") {
    return (
      <div className="relative z-10 w-full max-w-sm">
        <Logo />
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-red-600/10 border border-red-600/20 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7 text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-100">Convite inválido</h2>
            <p className="text-sm text-zinc-400 mt-1">{errorMsg}</p>
          </div>
          <Button variant="outline" onClick={() => router.push("/login")} className="w-full">
            Ir para o login
          </Button>
        </div>
      </div>
    );
  }

  if (pageState === "done") {
    return (
      <div className="relative z-10 w-full max-w-sm">
        <Logo />
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-600/10 border border-emerald-600/20 flex items-center justify-center mx-auto">
            <CheckCircle className="w-7 h-7 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-100">Acesso liberado!</h2>
            <p className="text-sm text-zinc-400 mt-1">
              Você agora é membro de{" "}
              <span className="text-zinc-200 font-medium">{joinedCompany}</span>.
            </p>
          </div>
          <Button className="w-full" onClick={() => { router.push("/"); router.refresh(); }}>
            Acessar o sistema
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10 w-full max-w-sm">
      <Logo />

      {/* Invite summary card */}
      <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-xl p-4 mb-4 space-y-2">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-indigo-400 shrink-0" />
          <p className="text-sm font-semibold text-zinc-100">{inviteInfo?.companyName}</p>
        </div>
        <p className="text-xs text-zinc-400">
          <span className="text-zinc-300">{inviteInfo?.invitedBy}</span> te convidou como{" "}
          <span className={`font-semibold ${ROLE_COLOR[inviteInfo?.role ?? ""] ?? "text-zinc-300"}`}>
            {inviteInfo?.roleLabel}
          </span>
        </p>
        {inviteInfo?.role === "ADMIN" && (
          <p className="text-xs text-amber-400 flex items-center gap-1">
            <Crown className="w-3 h-3" /> Acesso total de administrador
          </p>
        )}
      </div>

      {/* Auth card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4">

        {/* If already logged in */}
        {isLoggedIn ? (
          <>
            <div className="text-center space-y-1">
              <h2 className="text-lg font-bold text-zinc-100">Aceitar convite</h2>
              <p className="text-sm text-zinc-400">Você está logado. Clique para entrar na empresa.</p>
            </div>
            {errorMsg && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-950/50 border border-red-900 text-red-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" /> {errorMsg}
              </div>
            )}
            <Button
              className="w-full"
              onClick={acceptInvite}
              disabled={pageState === "accepting"}
            >
              {pageState === "accepting"
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Vinculando...</>
                : <><UserCheck className="w-4 h-4" /> Aceitar e acessar</>
              }
            </Button>
          </>
        ) : (
          <>
            {/* Auth mode tabs */}
            <div className="flex rounded-lg bg-zinc-800 p-1 gap-1">
              <button
                onClick={() => { setAuthMode("login"); setFormError(null); }}
                className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                  authMode === "login"
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Já tenho conta
              </button>
              <button
                onClick={() => { setAuthMode("register"); setFormError(null); }}
                className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                  authMode === "register"
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Criar conta
              </button>
            </div>

            {formError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-950/50 border border-red-900 text-red-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" /> {formError}
              </div>
            )}

            {authMode === "login" ? (
              <form onSubmit={handleLogin} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>E-mail</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Senha</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={formLoading}>
                  {formLoading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Entrando...</>
                    : <><UserCheck className="w-4 h-4" /> Entrar e aceitar</>
                  }
                </Button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Seu nome</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="João Silva"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>E-mail</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Criar senha</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    required
                    minLength={8}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={formLoading}>
                  {formLoading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando conta...</>
                    : <><UserCheck className="w-4 h-4" /> Criar conta e aceitar</>
                  }
                </Button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2 mb-6 justify-center">
      <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center">
        <Wallet className="w-5 h-5 text-white" />
      </div>
      <span className="text-xl font-bold text-zinc-100">Core Finance</span>
    </div>
  );
}
