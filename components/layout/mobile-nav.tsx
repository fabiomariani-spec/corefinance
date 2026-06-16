"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Wallet, X } from "lucide-react";
import type { UserRole } from "@prisma/client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import {
  bottomItems,
  filterGroupsByRole,
  isPathActive,
} from "@/components/layout/sidebar";
import { useNavigationProgress } from "@/components/layout/navigation-progress";

/**
 * Navegação mobile (< md): botão hambúrguer + drawer lateral que reaproveita a
 * MESMA spec de rotas da sidebar (navGroups/bottomItems via sidebar.tsx).
 * Fecha ao navegar, no Escape e no backdrop (Radix Dialog do projeto).
 */
export function MobileNav({ role = "ADMIN" }: { role?: UserRole }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { start: startNavProgress } = useNavigationProgress();

  const visibleGroups = filterGroupsByRole(role);

  // Fecha o drawer sempre que a rota muda (após navegar).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fecha o drawer ao trocar de rota
    setOpen(false);
  }, [pathname]);

  const handleNavClick = (href: string) => {
    if (href !== pathname) startNavProgress();
    setOpen(false);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      {/* Hambúrguer — só aparece em < md */}
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="Abrir menu de navegação"
          className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        {/* Backdrop — fecha ao clicar */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 md:hidden" />

        {/* Drawer lateral esquerdo */}
        <DialogPrimitive.Content
          className="fixed inset-y-0 left-0 z-50 flex w-[260px] max-w-[85vw] flex-col bg-zinc-900 border-r border-zinc-800 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left md:hidden"
        >
          <DialogPrimitive.Title className="sr-only">
            Menu de navegação
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Navegação principal do Core Finance
          </DialogPrimitive.Description>

          {/* Cabeçalho do drawer */}
          <div className="flex items-center justify-between px-4 h-16 border-b border-zinc-800 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
                <Wallet className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-zinc-100 text-base tracking-tight">
                Core Finance
              </span>
            </div>
            <DialogPrimitive.Close
              aria-label="Fechar menu de navegação"
              className="flex items-center justify-center w-9 h-9 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </DialogPrimitive.Close>
          </div>

          {/* Navegação */}
          <nav className="flex-1 px-2 py-4 space-y-3 overflow-y-auto">
            {visibleGroups.map((group) => {
              const GroupIcon = group.icon;
              return (
                <div key={group.label}>
                  <div className="flex items-center gap-2.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    <GroupIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>{group.label}</span>
                  </div>
                  <div className="mt-0.5 space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = isPathActive(pathname, item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          prefetch={false}
                          aria-current={isActive ? "page" : undefined}
                          onClick={() => handleNavClick(item.href)}
                          className={cn(
                            "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 min-h-[44px]",
                            isActive
                              ? "bg-indigo-600/15 text-indigo-400 font-medium border border-indigo-600/20"
                              : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 font-normal"
                          )}
                        >
                          <Icon className="w-4 h-4 shrink-0" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>

          {/* Itens do rodapé */}
          <div className="px-2 pb-4 pt-3 space-y-0.5 border-t border-zinc-800 shrink-0">
            {bottomItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => handleNavClick(item.href)}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all min-h-[44px]",
                    isActive
                      ? "bg-indigo-600/15 text-indigo-400"
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
