"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bell,
  ChevronDown,
  LogOut,
  Settings,
  User,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatDate } from "@/lib/formatters";
import { subMonths, addMonths } from "date-fns";
import { useEffect, useState } from "react";
import { MobileNav } from "@/components/layout/mobile-nav";

// Deriva a inicial do avatar a partir do nome ou email do usuário.
function initialFrom(name?: string | null, email?: string | null): string {
  const source = (name?.trim() || email?.trim() || "").replace(/^["']/, "");
  const ch = source.charAt(0).toUpperCase();
  // Fallback genérico (NÃO "F" hardcoded) caso não haja nome nem email.
  return /[A-Z0-9]/.test(ch) ? ch : "U";
}

interface HeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  currentDate?: Date;
  onDateChange?: (date: Date) => void;
  showDateNav?: boolean;
  actions?: React.ReactNode;
}

export function Header({
  title,
  subtitle,
  currentDate = new Date(),
  onDateChange,
  showDateNav = false,
  actions,
}: HeaderProps) {
  const router = useRouter();
  const supabase = createClient();
  const [userInitial, setUserInitial] = useState("U");

  // Busca a identidade do usuário no cliente (o Header é renderizado por página
  // e não recebe props de usuário, então derivamos o avatar aqui).
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const u = data?.user;
      const name = (u?.user_metadata as { name?: string } | undefined)?.name;
      setUserInitial(initialFrom(name, u?.email));
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function handlePrevMonth() {
    onDateChange?.(subMonths(currentDate, 1));
  }

  function handleNextMonth() {
    const next = addMonths(currentDate, 1);
    if (next <= new Date()) onDateChange?.(next);
  }

  // Wire global ←/→ shortcut to month nav when this header owns a date nav.
  useEffect(() => {
    if (!showDateNav || !onDateChange) return;
    function onNav(e: Event) {
      const dir = (e as CustomEvent<{ dir: number }>).detail?.dir;
      if (dir === -1) handlePrevMonth();
      else if (dir === 1) handleNextMonth();
    }
    window.addEventListener("shortcut:nav-month", onNav as EventListener);
    return () => window.removeEventListener("shortcut:nav-month", onNav as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDateNav, onDateChange, currentDate]);

  return (
    <header className="h-16 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm flex items-center justify-between px-4 md:px-6 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        {/* Hambúrguer mobile — abre o drawer de navegação (escondido em >= md) */}
        <MobileNav />
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-zinc-100 truncate">{title}</h1>
          {subtitle && <p className="text-xs text-zinc-500 truncate">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Date Navigator */}
        {showDateNav && (
          <div className="flex items-center gap-1 bg-zinc-800/60 rounded-lg px-3 py-1.5 border border-zinc-700">
            <button
              onClick={handlePrevMonth}
              aria-label="Mês anterior"
              className="text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-zinc-200 font-medium px-2 min-w-[130px] text-center capitalize">
              {formatDate(currentDate, "MMMM 'de' yyyy")}
            </span>
            <button
              onClick={handleNextMonth}
              disabled={addMonths(currentDate, 1) > new Date()}
              aria-label="Próximo mês"
              className="text-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {actions}

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500" />
        </Button>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Menu da conta"
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">
                {userInitial}
              </div>
              <ChevronDown className="w-3 h-3 text-zinc-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Minha conta</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="w-4 h-4 mr-2" /> Perfil
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="w-4 h-4 mr-2" /> Configurações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-red-400 focus:text-red-400">
              <LogOut className="w-4 h-4 mr-2" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
