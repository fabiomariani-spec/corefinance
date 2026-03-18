"use client";

import { Header } from "@/components/layout/header";
import { Settings } from "lucide-react";

export default function ConfiguracoesPage() {
  return (
    <>
      <Header title="Configurações" subtitle="Preferências do sistema" />
      <div className="flex-1 p-6 flex flex-col items-center justify-center text-zinc-500">
        <Settings className="w-12 h-12 mb-3 opacity-20" />
        <p className="text-sm">Configurações em desenvolvimento</p>
      </div>
    </>
  );
}
