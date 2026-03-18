"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Users,
  Plus,
  Copy,
  Check,
  Trash2,
  Loader2,
  Link as LinkIcon,
  Mail,
  Crown,
  AlertTriangle,
  Clock,
  UserCheck,
  RefreshCw,
} from "lucide-react";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Member {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  isCurrentUser: boolean;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  token: string;
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
}

interface TeamData {
  members: Member[];
  invites: Invite[];
  currentUserRole: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_META: Record<string, { label: string; color: string; bg: string }> = {
  ADMIN: { label: "Administrador", color: "text-indigo-300", bg: "bg-indigo-600/15 border-indigo-600/30" },
  MANAGER: { label: "Gerente", color: "text-violet-300", bg: "bg-violet-600/15 border-violet-600/30" },
  ACCOUNTANT: { label: "Financeiro", color: "text-amber-300", bg: "bg-amber-600/15 border-amber-600/30" },
  VIEWER: { label: "Visualizador", color: "text-zinc-400", bg: "bg-zinc-700/30 border-zinc-600/30" },
};

function RoleBadge({ role }: { role: string }) {
  const meta = ROLE_META[role] ?? { label: role, color: "text-zinc-400", bg: "bg-zinc-800 border-zinc-700" };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${meta.bg} ${meta.color}`}>
      {role === "ADMIN" && <Crown className="w-2.5 h-2.5" />}
      {meta.label}
    </span>
  );
}

function MemberAvatar({ name, isCurrentUser }: { name: string; isCurrentUser?: boolean }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 relative ${
      isCurrentUser ? "bg-indigo-600 text-white" : "bg-zinc-700 text-zinc-200"
    }`}>
      {initials}
      {isCurrentUser && (
        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-zinc-900" />
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EquipePage() {
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);

  // Invite form state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("ACCOUNTANT");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Remove member state
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [removing, setRemoving] = useState(false);

  const fetchTeam = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/team");
      if (res.ok) setTeamData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTeam(); }, [fetchTeam]);

  // ── Invite ───────────────────────────────────────────────────────────────
  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteError(null);

    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();

      if (!res.ok) {
        setInviteError(data.error ?? "Erro ao criar convite");
        return;
      }

      const link = `${window.location.origin}/convite/${data.token}`;
      setGeneratedLink(link);
      setInviteEmail("");
      fetchTeam();
    } finally {
      setInviting(false);
    }
  }

  async function handleCopyLink(link: string) {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRevokeInvite(token: string) {
    await fetch("/api/team/invite", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    fetchTeam();
  }

  // ── Remove member ─────────────────────────────────────────────────────────
  async function handleConfirmRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    await fetch("/api/team", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: removeTarget.userId }),
    });
    setRemoving(false);
    setRemoveTarget(null);
    fetchTeam();
  }

  const isAdmin = teamData?.currentUserRole === "ADMIN";

  return (
    <>
      <Header
        title="Equipe"
        subtitle="Gerencie quem tem acesso ao sistema financeiro"
      />

      <div className="flex-1 p-6 space-y-5">

        {/* ── Invite button ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-500">
            {teamData ? `${teamData.members.length} membro${teamData.members.length !== 1 ? "s" : ""}` : ""}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchTeam}
              className={`text-zinc-500 hover:text-zinc-300 transition-colors ${loading ? "animate-spin" : ""}`}
              title="Atualizar"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {isAdmin && (
              <Button onClick={() => { setInviteOpen(!inviteOpen); setGeneratedLink(null); setInviteError(null); }} size="sm">
                <Plus className="w-4 h-4" /> Convidar Membro
              </Button>
            )}
          </div>
        </div>

        {/* ── Invite panel ──────────────────────────────────────────────── */}
        {inviteOpen && isAdmin && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <LinkIcon className="w-4 h-4 text-indigo-400" />
              Gerar Link de Convite
            </h3>

            {!generatedLink ? (
              <form onSubmit={handleInvite} className="space-y-4">
                {inviteError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-950/50 border border-red-900 text-red-400 text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {inviteError}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>E-mail do colaborador</Label>
                    <Input
                      type="email"
                      placeholder="financeiro@empresa.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Permissão de acesso</Label>
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ADMIN">
                          <span className="flex items-center gap-2">
                            <Crown className="w-3.5 h-3.5 text-indigo-400" />
                            Administrador — acesso total
                          </span>
                        </SelectItem>
                        <SelectItem value="MANAGER">Gerente — lançamentos + relatórios</SelectItem>
                        <SelectItem value="ACCOUNTANT">Financeiro — lançamentos</SelectItem>
                        <SelectItem value="VIEWER">Visualizador — somente leitura</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={inviting}>
                    {inviting
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</>
                      : <><LinkIcon className="w-4 h-4" /> Gerar Link</>
                    }
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-900/20 border border-emerald-700/30">
                  <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <p className="text-sm text-emerald-300">
                    Convite gerado! Compartilhe o link abaixo com o colaborador.
                  </p>
                </div>
                <div className="flex items-center gap-2 p-3 bg-zinc-800 border border-zinc-700 rounded-lg">
                  <code className="text-xs text-zinc-300 flex-1 truncate">{generatedLink}</code>
                  <button
                    onClick={() => handleCopyLink(generatedLink)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-all shrink-0 ${
                      copied
                        ? "bg-emerald-600/20 text-emerald-400"
                        : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                    }`}
                  >
                    {copied ? <><Check className="w-3.5 h-3.5" /> Copiado!</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
                  </button>
                </div>
                <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  O link expira em 7 dias. Qualquer pessoa com o link pode acessar.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => { setGeneratedLink(null); setInviteEmail(""); }}
                  >
                    <Plus className="w-4 h-4" /> Novo convite
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setInviteOpen(false)}>
                    Fechar
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Members list ──────────────────────────────────────────────── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-800 flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-zinc-100">Membros Ativos</h3>
            {teamData && (
              <span className="ml-auto text-xs text-zinc-600">
                {teamData.members.length} membro{teamData.members.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {loading ? (
            <div className="p-5 space-y-3">
              {[1, 2].map((i) => <div key={i} className="h-14 skeleton rounded-lg" />)}
            </div>
          ) : teamData?.members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-600">
              <Users className="w-10 h-10 mb-2 opacity-20" />
              <p className="text-sm">Nenhum membro ativo</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/60">
              {teamData!.members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-zinc-800/30 transition-colors group"
                >
                  <MemberAvatar name={member.name} isCurrentUser={member.isCurrentUser} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-zinc-100 truncate">{member.name}</p>
                      {member.isCurrentUser && (
                        <span className="text-xs text-zinc-500">(você)</span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 truncate">{member.email}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <RoleBadge role={member.role} />
                    <span className="text-xs text-zinc-600 hidden sm:block">
                      desde {format(parseISO(member.createdAt), "dd/MM/yy", { locale: ptBR })}
                    </span>
                    {isAdmin && !member.isCurrentUser && member.role !== "ADMIN" && (
                      <button
                        onClick={() => setRemoveTarget(member)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400"
                        title="Remover membro"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Pending invites ───────────────────────────────────────────── */}
        {!loading && teamData && teamData.invites.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800 flex items-center gap-2">
              <Mail className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-zinc-100">Convites Pendentes</h3>
              <span className="ml-auto text-xs text-zinc-600">
                {teamData.invites.length} pendente{teamData.invites.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="divide-y divide-zinc-800/60">
              {teamData.invites.map((invite) => {
                const inviteLink = `${typeof window !== "undefined" ? window.location.origin : ""}/convite/${invite.token}`;
                const expiresIn = formatDistanceToNow(parseISO(invite.expiresAt), { locale: ptBR, addSuffix: true });

                return (
                  <div
                    key={invite.id}
                    className="flex items-center gap-4 px-5 py-3.5 group hover:bg-zinc-800/30 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-xl bg-amber-600/10 border border-amber-600/20 flex items-center justify-center shrink-0">
                      <Mail className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-200 truncate">{invite.email}</p>
                      <p className="text-xs text-zinc-500">
                        Convidado por {invite.invitedBy} · expira {expiresIn}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <RoleBadge role={invite.role} />
                      {isAdmin && (
                        <>
                          <button
                            onClick={() => handleCopyLink(inviteLink)}
                            className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
                            title="Copiar link do convite"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleRevokeInvite(invite.token)}
                            className="p-1.5 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors"
                            title="Revogar convite"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Permission info card ──────────────────────────────────────── */}
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Níveis de Acesso
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { role: "ADMIN", desc: "Acesso total: membros, configurações, todos os dados" },
              { role: "MANAGER", desc: "Lançamentos, relatórios, dashboard, categorias" },
              { role: "ACCOUNTANT", desc: "Criar e editar lançamentos, contas, cartões" },
              { role: "VIEWER", desc: "Somente visualização, sem editar ou criar" },
            ].map(({ role, desc }) => (
              <div key={role} className="space-y-1">
                <RoleBadge role={role} />
                <p className="text-xs text-zinc-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Remove confirm dialog ──────────────────────────────────────── */}
      <Dialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Remover membro
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-sm text-zinc-300">
              Tem certeza que deseja remover{" "}
              <span className="font-semibold text-white">{removeTarget?.name}</span>{" "}
              da equipe?
            </p>
            <p className="text-xs text-zinc-500">
              O acesso será revogado imediatamente. Você poderá convidá-lo novamente se necessário.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={removing}>
              Cancelar
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleConfirmRemove}
              disabled={removing}
            >
              {removing
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Removendo...</>
                : <><Trash2 className="w-4 h-4" /> Remover</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
