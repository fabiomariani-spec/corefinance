"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ArrowLeftRight,
  CreditCard,
  Building2,
  FileText,
  BarChart3,
  TrendingUp,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Tag,
  Upload,
  Wallet,
  Users,
  UserRound,
  CalendarDays,
} from "lucide-react";
import { useState, useEffect } from "react";

const groups = [
  {
    label: "Financeiro",
    icon: TrendingUp,
    items: [
      { label: "Painel",         href: "/",             icon: LayoutDashboard },
      { label: "Lançamentos",    href: "/lancamentos",  icon: ArrowLeftRight  },
      { label: "Fluxo de Caixa", href: "/fluxo-caixa",  icon: TrendingUp      },
    ],
  },
  {
    label: "Pagamentos",
    icon: Wallet,
    items: [
      { label: "Contas",   href: "/contas",   icon: Building2 },
      { label: "Cartões",  href: "/cartoes",  icon: CreditCard },
      { label: "Faturas",  href: "/faturas",  icon: Upload    },
    ],
  },
  {
    label: "Empresa",
    icon: Users,
    items: [
      { label: "Colaboradores", href: "/colaboradores", icon: UserRound   },
      { label: "Eventos",       href: "/eventos",       icon: CalendarDays },
      { label: "Categorias",    href: "/categorias",    icon: Tag          },
      { label: "Relatórios",    href: "/relatorios",    icon: BarChart3    },
      { label: "Equipe",        href: "/equipe",        icon: Users        },
    ],
  },
];

const bottomItems = [
  { label: "Configurações", href: "/configuracoes", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Determine which group contains the active route
  const activeGroupIndex = groups.findIndex((g) =>
    g.items.some(
      (item) =>
        pathname === item.href ||
        (item.href !== "/" && pathname.startsWith(item.href))
    )
  );

  const [openGroups, setOpenGroups] = useState<boolean[]>(() =>
    groups.map((_, i) => i === (activeGroupIndex >= 0 ? activeGroupIndex : 0))
  );

  // When route changes, open the group that contains it
  useEffect(() => {
    if (activeGroupIndex >= 0) {
      setOpenGroups((prev) =>
        prev.map((v, i) => (i === activeGroupIndex ? true : v))
      );
    }
  }, [pathname, activeGroupIndex]);

  const toggleGroup = (i: number) => {
    setOpenGroups((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  };

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-zinc-900 border-r border-zinc-800 transition-all duration-300 shrink-0",
        collapsed ? "w-[60px]" : "w-[220px]"
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex items-center gap-2.5 px-4 h-16 border-b border-zinc-800",
          collapsed && "justify-center px-0"
        )}
      >
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
          <Wallet className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <span className="font-bold text-zinc-100 text-base tracking-tight">
            Core Finance
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {groups.map((group, gi) => {
          const GroupIcon = group.icon;
          const isGroupActive = group.items.some(
            (item) =>
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href))
          );
          const isOpen = openGroups[gi];

          return (
            <div key={group.label}>
              {/* Group header */}
              <button
                onClick={() => !collapsed && toggleGroup(gi)}
                title={collapsed ? group.label : undefined}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150",
                  isGroupActive
                    ? "text-indigo-400"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70",
                  collapsed && "justify-center px-2"
                )}
              >
                <GroupIcon className="w-4 h-4 shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">{group.label}</span>
                    <ChevronDown
                      className={cn(
                        "w-3.5 h-3.5 text-zinc-500 transition-transform duration-200",
                        isOpen && "rotate-180"
                      )}
                    />
                  </>
                )}
              </button>

              {/* Sub-items */}
              {!collapsed && isOpen && (
                <div className="mt-0.5 ml-3 pl-3 border-l border-zinc-800 space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/" && pathname.startsWith(item.href));
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all duration-150",
                          isActive
                            ? "bg-indigo-600/15 text-indigo-400 font-medium border border-indigo-600/20"
                            : "text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800/70 font-normal"
                        )}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}

              {/* Collapsed: show all sub-icons directly */}
              {collapsed && (
                <div className="mt-0.5 space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/" && pathname.startsWith(item.href));
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={item.label}
                        className={cn(
                          "flex justify-center px-2 py-2 rounded-lg transition-all duration-150",
                          isActive
                            ? "bg-indigo-600/15 text-indigo-400"
                            : "text-zinc-600 hover:text-zinc-100 hover:bg-zinc-800/70"
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-2 pb-4 space-y-0.5 border-t border-zinc-800 pt-4">
        {bottomItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                isActive
                  ? "bg-indigo-600/15 text-indigo-400"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70",
                collapsed && "justify-center px-2"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        {/* Collapse button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/70 transition-all w-full",
            collapsed && "justify-center px-2"
          )}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span>Recolher</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
