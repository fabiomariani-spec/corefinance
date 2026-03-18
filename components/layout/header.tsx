"use client";

import { useState } from "react";
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
  Calendar,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatDate } from "@/lib/formatters";
import { startOfMonth, endOfMonth, subMonths, addMonths } from "date-fns";

interface HeaderProps {
  title: string;
  subtitle?: string;
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

  return (
    <header className="h-16 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm flex items-center justify-between px-6 shrink-0">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">{title}</h1>
        {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        {/* Date Navigator */}
        {showDateNav && (
          <div className="flex items-center gap-1 bg-zinc-800/60 rounded-lg px-3 py-1.5 border border-zinc-700">
            <button onClick={handlePrevMonth} className="text-zinc-400 hover:text-zinc-100 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-zinc-200 font-medium px-2 min-w-[130px] text-center capitalize">
              {formatDate(currentDate, "MMMM 'de' yyyy")}
            </span>
            <button
              onClick={handleNextMonth}
              disabled={addMonths(currentDate, 1) > new Date()}
              className="text-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {actions}

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500" />
        </Button>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors">
              <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">
                F
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
