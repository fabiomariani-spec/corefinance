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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  UserPlus,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/lib/toast";

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

  // Toast — usa o sistema global em lib/toast (montado em layout raiz).
  const showToast = useCallback((msg: string, kind: "success" | "error" = "success") => {
    if (kind === "error") toast.error(msg);
    else toast.success(msg);
  }, []);

  // Resend invite state
  const [resendingId, setResendingId] = useState<string | null>(null);

  // Add-member-directly modal state
  const [addOpen, setAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState("ACCOUNTANT");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addFallbackLink, setAddFallbackLink] = useState<string | null>(null);

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

  async function handleResendInvite(invite: Invite) {
    setResendingId(invite.id);
    try {
      const res = await fetch("/api/team/invite/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId: invite.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Erro ao reenviar convite", "error");
        return;
      }
      const link = `${window.location.origin}/convite/${data.token}`;
      try {
        await navigator.clipboard.writeText(link);
      } catch {
        // ignore clipboard failures (insecure context, etc.)
      }
      showToast("Convite reenviado, link copiado");
      fetchTeam();
    } finally {
      setResendingId(null);
    }
  }

  // ── Add member directly ──────────────────────────────────────────────────
  function openAddModal() {
    setAddEmail("");
    setAddRole("ACCOUNTANT");
    setAddError(null);
    setAddFallbackLink(null);
    setAddOpen(true);
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    setAddFallbackLink(null);

    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addEmail, role: addRole }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 202 && data.token) {
        // Usuário ainda não existe no Auth — convite gerado
        const link = `${window.location.origin}/convite/${data.token}`;
        setAddFallbackLink(link);
        showToast("Usuário ainda não cadastrado — convite gerado");
        fetchTeam();
        return;
      }

      if (!res.ok) {
        if (res.status === 409) {
          setAddError(data.error ?? "Esse usuário já é membro");
        } else if (res.status === 403) {
          setAddError(data.error ?? "Você não tem permissão pra adicionar membros");
        } else if (res.status === 400) {
          setAddError(data.error ?? "Dados inválidos");
        } else {
          setAddError(data.error ?? "Erro ao adicionar membro");
        }
        return;
      }

      showToast("Membro adicionado");
      setAddOpen(false);
      fetchTeam();
    } catch {
      setAddError("Erro de rede ao adicionar membro");
    } finally {
      setAdding(false);
    }
  }

  async function handleChangeRole(member: Member, newRole: string) {
    if (member.role === newRole) return;
    const previousRole = member.role;

    // Optimistic update
    setTeamData((prev) =>
      prev
        ? {
            ...prev,
            members: prev.members.map((m) =>
              m.id === member.id ? { ...m, role: newRole } : m
            ),
          }
        : prev
    );

    try {
      const res = await fetch(`/api/team/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // Revert
        setTeamData((prev) =>
          prev
            ? {
                ...prev,
                members: prev.members.map((m) =>
                  m.id === member.id ? { ...m, role: previousRole } : m
                ),
              }
            : prev
        );
        showToast(data.error ?? "Erro ao alterar permissão", "error");
        return;
      }
      showToast("Permissão atualizada");
    } catch {
      setTeamData((prev) =>
        prev
          ? {
              ...prev,
              members: prev.members.map((m) =>
                m.id === member.id ? { ...m, role: previousRole } : m
              ),
            }
          : prev
      );
      showToast("Erro ao alterar permissão", "error");
    }
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
              <>
                <Button onClick={openAddModal} size="sm" variant="outline">
                  <UserPlus className="w-4 h-4" /> Adicionar Membro
                </Button>
                <Button onClick={() => { setInviteOpen(!inviteOpen); setGeneratedLink(null); setInviteError(null); }} size="sm">
                  <Plus className="w-4 h-4" /> Convidar Membro
                </Button>
              </>
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

        {/* ── Solo-user CTA: only current user, no invites pending ───────── */}
        {!loading &&
         teamData &&
         teamData.members.length === 1 &&
         teamData.members[0].isCurrentUser &&
         teamData.invites.length === 0 &&
         !inviteOpen &&
         isAdmin && (
          <EmptyState
            icon={UserPlus}
            title="Convide colegas pra colaborar"
            description="Você está sozinho aqui. Convide o financeiro, contador ou outros sócios pra dividir o trabalho — cada um com permissões específicas."
            actionLabel={
              <>
                <Plus className="w-4 h-4" /> Convidar Membro
              </>
            }
            onAction={() => { setInviteOpen(true); setGeneratedLink(null); setInviteError(null); }}
          />
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
            <EmptyState
              size="md"
              icon={Users}
              title="Nenhum membro ativo"
              description="Algo estranho aconteceu — você deveria estar listado aqui. Tente atualizar."
              actionLabel={
                <>
                  <RefreshCw className="w-4 h-4" /> Atualizar
                </>
              }
              onAction={fetchTeam}
              actionVariant="outline"
            />
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
                    {isAdmin && member.role !== "EVENTS_ONLY" ? (
                      <Select
                        value={member.role}
                        onValueChange={(v) => handleChangeRole(member, v)}
                      >
                        <SelectTrigger
                          className="h-7 px-2 py-0 text-xs w-auto min-w-[8.5rem] bg-zinc-800/60 border-zinc-700 hover:border-indigo-600/50 focus:ring-indigo-600/40"
                          title="Alterar permissão"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ADMIN">
                            <span className="flex items-center gap-2">
                              <Crown className="w-3 h-3 text-indigo-400" />
                              Administrador
                            </span>
                          </SelectItem>
                          <SelectItem value="MANAGER">Gerente</SelectItem>
                          <SelectItem value="ACCOUNTANT">Financeiro</SelectItem>
                          <SelectItem value="VIEWER">Visualizador</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <RoleBadge role={member.role} />
                    )}
                    <span className="text-xs text-zinc-600 hidden sm:block">
                      desde {format(parseISO(member.createdAt), "dd/MM/yy", { locale: ptBR })}
                    </span>
                    {isAdmin && !member.isCurrentUser && member.role !== "ADMIN" && (
                      <button
                        onClick={() => setRemoveTarget(member)}
                        className="p-1.5 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors"
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
                            onClick={() => handleResendInvite(invite)}
                            disabled={resendingId === invite.id}
                            className="p-1.5 rounded hover:bg-indigo-500/10 text-zinc-500 hover:text-indigo-300 transition-colors disabled:opacity-50"
                            title="Reenviar convite (gera novo link)"
                          >
                            {resendingId === invite.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3.5 h-3.5" />
                            )}
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

      {/* ── Add member directly modal ─────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!adding) setAddOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-indigo-400" />
              Adicionar membro
            </DialogTitle>
            <DialogDescription>
              Adicione um usuário existente diretamente ao time pelo e-mail. Se ele ainda não
              tiver conta, geramos um convite automaticamente.
            </DialogDescription>
          </DialogHeader>

          {addFallbackLink ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-900/20 border border-amber-700/30">
                <Mail className="w-4 h-4 text-amber-400 shrink-0" />
                <p className="text-sm text-amber-200">
                  Esse e-mail ainda não tem conta. Compartilhe o link de convite abaixo.
                </p>
              </div>
              <div className="flex items-center gap-2 p-3 bg-zinc-800 border border-zinc-700 rounded-lg">
                <code className="text-xs text-zinc-300 flex-1 truncate">{addFallbackLink}</code>
                <button
                  onClick={() => handleCopyLink(addFallbackLink)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-all shrink-0 ${
                    copied
                      ? "bg-emerald-600/20 text-emerald-400"
                      : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                  }`}
                >
                  {copied ? <><Check className="w-3.5 h-3.5" /> Copiado!</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
                </button>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)}>
                  Fechar
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleAddMember} className="space-y-4">
              {addError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-950/50 border border-red-900 text-red-400 text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {addError}
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="add-email">E-mail</Label>
                <Input
                  id="add-email"
                  type="email"
                  placeholder="colaborador@empresa.com"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  required
                  disabled={adding}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>Permissão</Label>
                <Select value={addRole} onValueChange={setAddRole} disabled={adding}>
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
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={adding}>
                  {adding ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Adicionando...</>
                  ) : (
                    <><UserPlus className="w-4 h-4" /> Adicionar</>
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Remove confirm dialog ──────────────────────────────────────── */}
      <ConfirmDialog
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleConfirmRemove}
        title="Remover membro"
        confirmLabel="Remover"
        loadingLabel="Removendo..."
        loading={removing}
        message={
          <>
            <p>
              Tem certeza que deseja remover{" "}
              <span className="font-semibold text-white">{removeTarget?.name}</span>{" "}
              da equipe?
            </p>
            <p className="text-xs text-zinc-500 mt-2">
              O acesso será revogado imediatamente. Você poderá convidá-lo novamente se necessário.
            </p>
          </>
        }
      />

    </>
  );
}
