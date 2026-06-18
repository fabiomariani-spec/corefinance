"use client";

import React, { useState, useEffect, useRef } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  Upload,
  FileText,
  CheckCircle,
  Loader2,
  Sparkles,
  AlertCircle,
  CreditCard,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Check,
  BarChart2,
  Plus,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useRouter } from "next/navigation";

interface CreditCardData { id: string; name: string; brand: string; }
interface ExtractedItem {
  date: string;
  description: string;
  amount: number;       // negative for credits/refunds
  isCredit: boolean;
  establishment: string | null;
  installmentInfo: string | null;
  section: string | null;
  chargedThisMonth: boolean;
  suggestedCategory: string | null;
  categoryId: string | null;
  departmentId: string | null;
  confidence: number | null;
  include: boolean;
}
interface ExtractionResult {
  items: ExtractedItem[];
  totalAmount: number;
  referenceMonth: string | null;
  dueDate: string | null;
  categories: { id: string; name: string }[];
  creditCard: { id: string; name: string; brand: string };
}

type Step = "upload" | "processing" | "review" | "done";

export default function FaturasPage() {
  const router = useRouter();
  const [cards, setCards] = useState<CreditCardData[]>([]);
  const [cardsLoaded, setCardsLoaded] = useState(false);
  const [selectedCard, setSelectedCard] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>("upload");
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState<{ invoiceId: string; created: number; skipped: number } | null>(null);
  // Trava de conciliação: só libera importar com divergência > 1 centavo se o
  // usuário marcar ciência explícita (financeiro não fecha "no chute").
  const [confirmAnyway, setConfirmAnyway] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  // Agrupamento visual por estabelecimento na lista de itens (não toca DB)
  const [groupByEstablishment, setGroupByEstablishment] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  // Datas editáveis na revisão (sobrescrevem o que foi extraído)
  const [editDueDate, setEditDueDate] = useState<string>("");
  const [editPaymentDate, setEditPaymentDate] = useState<string>("");
  const [autoCountdown, setAutoCountdown] = useState(false);
  const [processingElapsedMs, setProcessingElapsedMs] = useState(0);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/credit-cards").then((r) => r.json()).then((data) => {
      setCards(Array.isArray(data) ? data : []);
      setCardsLoaded(true);
      // Auto pre-select if user has only 1 card
      if (Array.isArray(data) && data.length === 1) {
        setSelectedCard(data[0].id);
      }
    }).catch(() => setCardsLoaded(true));
  }, []);

  // Auto-process: when file is set AND card is selected, kick off after 1s
  useEffect(() => {
    if (file && selectedCard && step === "upload") {
      setAutoCountdown(true);
      autoTimerRef.current = setTimeout(() => {
        setAutoCountdown(false);
        handleProcess();
      }, 1000);
      return () => {
        if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, selectedCard, step]);

  function cancelAutoProcess() {
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    setAutoCountdown(false);
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }

  async function handleProcess() {
    if (!file || !selectedCard) return;
    setStep("processing");
    setError(null);
    setConfirmAnyway(false); // cada fatura começa com a trava armada

    const formData = new FormData();
    formData.append("file", file);
    formData.append("creditCardId", selectedCard);

    try {
      // Upload é rápido (<5s) — só dispara processamento async, retorna jobId.
      const uploadRes = await fetch("/api/invoices/upload", {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || uploadData.error) {
        throw new Error(uploadData.error || `Erro ${uploadRes.status} no upload`);
      }
      const jobId = uploadData.jobId as string;

      // Polling: checa status de 2 em 2s até READY ou ERROR (timeout 10min)
      const startedAt = Date.now();
      const TIMEOUT_MS = 10 * 60 * 1000;
      let data: ExtractionResult & { error?: string };
      while (true) {
        await new Promise((r) => setTimeout(r, 2000));
        if (Date.now() - startedAt > TIMEOUT_MS) {
          throw new Error("Processamento demorou demais (>10min). Tente novamente.");
        }
        const jobRes = await fetch(`/api/invoices/job/${jobId}`);
        const jobData = await jobRes.json();
        if (jobData.error) throw new Error(jobData.error);
        setProcessingElapsedMs(jobData.elapsedMs ?? 0);
        if (jobData.status === "READY") {
          data = jobData.result;
          break;
        }
        if (jobData.status === "ERROR") {
          throw new Error(jobData.error || "Falha na extração");
        }
      }

      setResult(data);
      // Pré-marca itens chargedThisMonth=true. Section breakdown panel acima
      // dá controle pro user desmarcar bulk por seção (ex: "Próximas faturas").
      setItems(
        data.items.map((item) => ({
          ...item,
          include: item.chargedThisMonth ?? true,
        }))
      );
      // Pré-preenche vencimento com o que a IA extraiu (formato YYYY-MM-DD pro <input type="date">)
      if (data.dueDate) {
        const d = data.dueDate.includes("/")
          ? data.dueDate.split("/").reverse().join("-")
          : data.dueDate.slice(0, 10);
        setEditDueDate(d);
      } else {
        setEditDueDate("");
      }
      // Pré-preenche pagamento com hoje — geralmente quem sobe fatura já pagou.
      // Pode limpar se for o caso raro de fatura ainda em aberto.
      setEditPaymentDate(new Date().toISOString().slice(0, 10));
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
      setStep("upload");
    }
  }

  async function handleConfirm(summaryOnly = false) {
    if (!result) return;
    setConfirming(true);
    setError(null);

    try {
      const res = await fetch("/api/invoices/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creditCardId: selectedCard,
          referenceMonth: result.referenceMonth ?? new Date().toISOString().slice(0, 7),
          dueDate: editDueDate || result.dueDate,
          paymentDate: editPaymentDate || null,
          totalAmount: result.totalAmount,
          items: summaryOnly ? [] : items,
          summaryOnly,
          // Repassa a ciência da divergência pro servidor (que revalida a
          // conciliação por conta própria — a trava da tela não basta).
          confirmAnyway,
        }),
      });

      // Fluxo financeiro crítico: não engolir falha. Sucesso avança pro "done";
      // qualquer erro mantém o user na revisão com mensagem acionável.
      let data: { invoiceId?: string; transactionsCreated?: number; skippedDuplicates?: number; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        /* corpo vazio / não-JSON — tratado abaixo pelo res.ok */
      }

      if (!res.ok || data.error) {
        setError(
          data.error ||
            `Não foi possível confirmar a importação (erro ${res.status}). Os lançamentos NÃO foram salvos — revise e tente de novo.`
        );
        return; // permanece no step "review", seleção/edições preservadas
      }

      setConfirmed({
        invoiceId: data.invoiceId!,
        created: data.transactionsCreated ?? 0,
        skipped: data.skippedDuplicates ?? 0,
      });
      setStep("done");
    } catch (err) {
      setError(
        err instanceof Error
          ? `Falha ao confirmar: ${err.message}. Verifique a conexão — os lançamentos NÃO foram salvos.`
          : "Falha ao confirmar a importação. Os lançamentos NÃO foram salvos — tente novamente."
      );
    } finally {
      setConfirming(false);
    }
  }

  // Extract merchant key for fuzzy matching: "MERCADOLIVRE*FOTOCENT" → "mercadolivre"
  function merchantKey(desc: string): string {
    const lower = desc.toLowerCase().trim();
    const starIdx = lower.indexOf("*");
    if (starIdx > 0) return lower.slice(0, starIdx).replace(/[^a-z0-9]/g, "");
    // No *, use first meaningful word (strip trailing numbers/specials)
    return lower.replace(/[\d\s\-_./]+$/, "").split(/[\s\d]/)[0].replace(/[^a-z]/g, "");
  }

  function toggleItem(index: number) {
    setItems((prev) => prev.map((item, i) => i === index ? { ...item, include: !item.include } : item));
  }

  function updateCategory(index: number, categoryId: string) {
    const targetKey = merchantKey(items[index].description);
    setItems((prev) =>
      prev.map((item, i) => {
        if (i === index) return { ...item, categoryId };
        // Fuzzy: same merchant prefix OR exact description match
        if (merchantKey(item.description) === targetKey && targetKey.length >= 3) return { ...item, categoryId };
        return item;
      })
    );
  }

  const includedCount = items.filter((i) => i.include).length;
  const includedTotal = items.filter((i) => i.include).reduce((s, i) => s + i.amount, 0);
  const includedCredits = items.filter((i) => i.include && i.amount < 0).reduce((s, i) => s + i.amount, 0);
  const includedPurchases = items.filter((i) => i.include && i.amount > 0).reduce((s, i) => s + i.amount, 0);
  const reconciliationDiff = result ? Math.abs(includedTotal - result.totalAmount) : 0;
  // Financeiro: a soma dos itens incluídos TEM que bater com o total impresso da
  // fatura no centavo. Tolerância de R$ 0,01 só cobre arredondamento. Acima
  // disso a importação é BLOQUEADA (ver botão Confirmar) — exige revisão dos
  // itens ou ciência explícita. Antes a tolerância era 0,5% (R$ 1.560 numa
  // fatura de 312k), o que deixava passar erros de milhares de reais.
  const reconciliationTolerance = 0.01;
  const hasReconciliationIssue = result ? reconciliationDiff > reconciliationTolerance : false;
  const futureItemsCount = items.filter((i) => !i.chargedThisMonth).length;

  // Agrupa items por estabelecimento (merchantKey). Cada grupo guarda os
  // índices originais do array `items` pra preservar update/toggle.
  // Categoria "majoritária" do grupo = mais frequente entre items inclusos.
  const itemGroups = (() => {
    const groups = new Map<string, {
      key: string;
      label: string;
      indices: number[];
    }>();
    items.forEach((item, idx) => {
      const key = merchantKey(item.description) || `__solo__${idx}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: item.establishment || item.description,
          indices: [],
        });
      }
      groups.get(key)!.indices.push(idx);
    });
    return Array.from(groups.values()).map((g) => {
      const groupItems = g.indices.map((i) => items[i]);
      const total = groupItems.reduce((s, it) => s + it.amount, 0);
      const includedItems = groupItems.filter((it) => it.include);
      // Categoria majoritária entre items inclusos
      const catCounts = new Map<string, number>();
      for (const it of includedItems) {
        if (!it.categoryId) continue;
        catCounts.set(it.categoryId, (catCounts.get(it.categoryId) ?? 0) + 1);
      }
      let majorityCategory: string | null = null;
      let maxCount = 0;
      for (const [cat, count] of catCounts) {
        if (count > maxCount) { maxCount = count; majorityCategory = cat; }
      }
      const distinctCats = catCounts.size;
      const allIncluded = groupItems.every((it) => it.include);
      const someIncluded = groupItems.some((it) => it.include);
      return {
        ...g,
        items: groupItems,
        total,
        includedCount: includedItems.length,
        majorityCategory,
        hasMixedCategories: distinctCats > 1,
        checkState: allIncluded ? "all" as const : someIncluded ? "some" as const : "none" as const,
      };
    }).sort((a, b) => b.total - a.total);
  })();

  function toggleGroup(groupKey: string) {
    const group = itemGroups.find((g) => g.key === groupKey);
    if (!group) return;
    const newInclude = group.checkState !== "all"; // se nem todos inclusos, marca todos
    setItems((prev) => prev.map((it, i) =>
      group.indices.includes(i) ? { ...it, include: newInclude } : it
    ));
  }

  function setGroupCategory(groupKey: string, categoryId: string) {
    const group = itemGroups.find((g) => g.key === groupKey);
    if (!group) return;
    setItems((prev) => prev.map((it, i) =>
      group.indices.includes(i) ? { ...it, categoryId } : it
    ));
  }

  function toggleGroupExpanded(groupKey: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  // Analysis: group included expenses by category, then by merchant
  const analysisGroups = (() => {
    const catMap = new Map<string, { name: string; total: number; merchants: Map<string, { label: string; total: number; count: number }> }>();
    for (const item of items) {
      if (!item.include || item.amount <= 0) continue;
      const catKey = item.categoryId ?? "__none__";
      const catName = result?.categories.find((c) => c.id === item.categoryId)?.name ?? "Sem categoria";
      if (!catMap.has(catKey)) catMap.set(catKey, { name: catName, total: 0, merchants: new Map() });
      const cat = catMap.get(catKey)!;
      cat.total += item.amount;
      const mKey = merchantKey(item.description);
      const mLabel = item.establishment || item.description;
      if (!cat.merchants.has(mKey)) cat.merchants.set(mKey, { label: mLabel, total: 0, count: 0 });
      const m = cat.merchants.get(mKey)!;
      m.total += item.amount;
      m.count += 1;
    }
    return Array.from(catMap.entries())
      .map(([id, g]) => ({ id, name: g.name, total: g.total, merchants: Array.from(g.merchants.values()).sort((a, b) => b.total - a.total) }))
      .sort((a, b) => b.total - a.total);
  })();
  const analysisTotal = analysisGroups.reduce((s, g) => s + g.total, 0);

  // Section breakdown: agrupa itens pela seção que a IA identificou,
  // mostra status (entra no total deste mês ou não), permite toggle bulk.
  const sectionGroups = (() => {
    const map = new Map<string, { name: string; chargedThisMonth: boolean; total: number; count: number; indices: number[] }>();
    items.forEach((item, idx) => {
      const key = item.section ?? "Sem seção";
      if (!map.has(key)) {
        map.set(key, { name: key, chargedThisMonth: item.chargedThisMonth, total: 0, count: 0, indices: [] });
      }
      const g = map.get(key)!;
      g.total += item.amount;
      g.count += 1;
      g.indices.push(idx);
    });
    return Array.from(map.values()).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  })();

  function toggleSection(indices: number[], turnOn: boolean) {
    setItems((prev) => prev.map((item, i) => indices.includes(i) ? { ...item, include: turnOn } : item));
  }

  return (
    <>
      <Header
        title="Importar Fatura"
        subtitle={
          <span className="flex items-center gap-2 text-zinc-500">
            <button
              onClick={() => router.push("/faturas")}
              className="hover:text-zinc-300 flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Faturas
            </button>
            <span>/</span>
            <span>Importar</span>
          </span>
        }
      />
      <div className="flex-1 p-6">
        {/* Steps Indicator */}
        <div className="flex items-center gap-2 mb-6">
          {["upload", "processing", "review", "done"].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  step === s
                    ? "bg-indigo-600 text-white"
                    : ["done", "review", "processing"].indexOf(step) >= ["done", "review", "processing"].indexOf(s)
                    ? "bg-indigo-600/30 text-indigo-400"
                    : "bg-zinc-800 text-zinc-500"
                }`}
              >
                {i + 1}
              </div>
              <span className={`text-xs ${step === s ? "text-zinc-100" : "text-zinc-500"}`}>
                {s === "upload" ? "Upload" : s === "processing" ? "Processando" : s === "review" ? "Revisão" : "Concluído"}
              </span>
              {i < 3 && <ChevronRight className="w-3 h-3 text-zinc-700" />}
            </div>
          ))}
        </div>

        {/* Step: Upload */}
        {step === "upload" && cardsLoaded && cards.length === 0 && (
          <EmptyState
            icon={CreditCard}
            title="Cadastre um cartão antes de importar"
            description="A leitura automática de fatura precisa de pelo menos 1 cartão cadastrado pra associar os lançamentos. Leva 30 segundos."
            actionLabel={
              <>
                <Plus className="w-4 h-4" /> Cadastrar Cartão
              </>
            }
            onAction={() => router.push("/cartoes")}
          />
        )}

        {/* Step: Upload */}
        {step === "upload" && (!cardsLoaded || cards.length > 0) && (
          <div className="max-w-xl mx-auto space-y-5">
            {error && (
              <div className="flex items-center gap-2 p-4 rounded-lg bg-red-950/50 border border-red-900 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Select Card — hidden when user has exactly 1 card (auto pre-selected) */}
            {cards.length !== 1 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-indigo-400" />
                  Selecione o Cartão
                </h3>
                <Select value={selectedCard} onValueChange={setSelectedCard}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha o cartão da fatura..." />
                  </SelectTrigger>
                  <SelectContent>
                    {cards.map((card) => (
                      <SelectItem key={card.id} value={card.id}>
                        {card.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* File Drop */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                file
                  ? "border-indigo-600/50 bg-indigo-600/5"
                  : "border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/30"
              }`}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,image/*"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="space-y-2">
                  <FileText className="w-10 h-10 text-indigo-400 mx-auto" />
                  <p className="text-zinc-100 font-medium">{file.name}</p>
                  <p className="text-xs text-zinc-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <p className="text-xs text-indigo-400">Clique para trocar o arquivo</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="w-10 h-10 text-zinc-600 mx-auto" />
                  <p className="text-zinc-300 font-medium">
                    Arraste o PDF ou imagem da fatura
                  </p>
                  <p className="text-xs text-zinc-500">
                    PDF, JPG, PNG, WEBP — máx. 20MB
                  </p>
                </div>
              )}
            </div>

            {/* Auto-process countdown banner */}
            {autoCountdown && (
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-indigo-950/40 border border-indigo-900/50 text-sm text-indigo-300">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  <span>Processando automaticamente em 1s...</span>
                </div>
                <button
                  onClick={cancelAutoProcess}
                  className="text-xs font-semibold text-indigo-200 hover:text-white px-2 py-1 rounded border border-indigo-800 hover:bg-indigo-900/40 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            )}

            {/* Manual fallback — hidden during auto-process */}
            {!autoCountdown && (
              <Button
                className="w-full"
                onClick={handleProcess}
                disabled={!file || !selectedCard}
                size="lg"
              >
                <Sparkles className="w-4 h-4" />
                Processar com IA
              </Button>
            )}
          </div>
        )}

        {/* Step: Processing */}
        {step === "processing" && (
          <div className="max-w-xl mx-auto flex flex-col items-center justify-center py-24 space-y-4">
            <div className="w-16 h-16 rounded-full bg-indigo-600/15 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-100">
              Processando fatura{processingElapsedMs > 0 ? ` · ${Math.round(processingElapsedMs / 1000)}s` : "..."}
            </h3>
            <p className="text-sm text-zinc-400 text-center max-w-xs">
              O Claude está lendo e extraindo os lançamentos da sua fatura. Faturas grandes (30+ páginas) podem levar até 2 minutos.
            </p>
            <div className="flex gap-1.5 mt-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Step: Review */}
        {step === "review" && result && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-5 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-xs text-zinc-500 mb-1">Cartão</p>
                <p className="font-semibold text-zinc-100 truncate">{result.creditCard.name}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-xs text-zinc-500 mb-1">Lançamentos</p>
                <p className="font-semibold text-zinc-100">{result.items.length}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-xs text-zinc-500 mb-1">Total da fatura</p>
                <p className="font-semibold text-zinc-100">{formatCurrency(result.totalAmount)}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <label className="text-xs text-zinc-500 mb-1 block">Vencimento</label>
                <input
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  className="w-full bg-transparent text-zinc-100 font-semibold text-sm outline-none border-b border-transparent focus:border-indigo-500"
                />
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <label className="text-xs text-zinc-500 mb-1 block">Pagamento</label>
                <input
                  type="date"
                  value={editPaymentDate}
                  onChange={(e) => setEditPaymentDate(e.target.value)}
                  placeholder="Em aberto"
                  className="w-full bg-transparent text-zinc-100 font-semibold text-sm outline-none border-b border-transparent focus:border-indigo-500"
                />
                {editPaymentDate ? (
                  <p className="text-[10px] text-emerald-600 mt-0.5">Marcado como pago — limpe se ainda em aberto</p>
                ) : (
                  <p className="text-[10px] text-zinc-600 mt-0.5">Vazio = pendente</p>
                )}
              </div>
            </div>

            {/* Tip */}
            <div className="flex items-start gap-2 p-3 bg-indigo-950/40 border border-indigo-900/50 rounded-lg text-xs text-indigo-300">
              <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                Revise os lançamentos abaixo. Itens em <span className="text-emerald-400 font-semibold">verde</span> são créditos/estornos (reduzem o total). Ajuste categorias e desmarque os que não devem ser importados.
                {futureItemsCount > 0 && (
                  <> <strong className="text-zinc-200">{futureItemsCount}</strong> {futureItemsCount === 1 ? "lançamento foi detectado" : "lançamentos foram detectados"} como parcela futura ou fora deste mês — vêm desmarcados por padrão.</>
                )}
              </span>
            </div>

            {/* Resumo financeiro — compras + créditos = total */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-3">Resumo financeiro</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="flex flex-col">
                  <span className="text-xs text-zinc-500">Compras</span>
                  <span className="font-semibold text-zinc-100 tabular-nums">{formatCurrency(includedPurchases)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-zinc-500">Créditos / Estornos</span>
                  <span className={`font-semibold tabular-nums ${includedCredits < 0 ? "text-emerald-400" : "text-zinc-100"}`}>
                    {formatCurrency(includedCredits)}
                  </span>
                </div>
                <div className="flex flex-col md:items-end md:border-l md:border-zinc-800 md:pl-4">
                  <span className="text-xs text-zinc-500">Total</span>
                  <span className="font-semibold text-zinc-100 tabular-nums text-lg">{formatCurrency(includedTotal)}</span>
                  {result && Math.abs(includedTotal - result.totalAmount) > 0.01 && (
                    <span className="text-xs text-zinc-500 mt-0.5">
                      fatura impressa: {formatCurrency(result.totalAmount)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Reconciliation banner — só aparece quando a divergência é >1%.
                Discreto, informativo, sem alarme. */}
            {hasReconciliationIssue && (
              <div className="flex items-start gap-2 p-3 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-400">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-zinc-500" />
                <span>
                  Soma dos selecionados {formatCurrency(includedTotal)} · fatura impressa {formatCurrency(result!.totalAmount)} · diferença <strong className="text-zinc-300">{formatCurrency(reconciliationDiff)}</strong>. Pode ser parcela futura, encargo ou crédito não capturado — verifique as seções abaixo.
                </span>
              </div>
            )}

            {/* Section breakdown — mostra o que a IA identificou como cada parte da fatura */}
            {sectionGroups.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                    <BarChart2 className="w-4 h-4 text-indigo-400" />
                    Seções identificadas
                  </span>
                  <span className="text-xs text-zinc-500">{sectionGroups.length} {sectionGroups.length === 1 ? "seção" : "seções"}</span>
                </div>
                <div className="divide-y divide-zinc-800/60">
                  {sectionGroups.map((g) => {
                    const allSelected = g.indices.every((i) => items[i]?.include);
                    const noneSelected = g.indices.every((i) => !items[i]?.include);
                    return (
                      <div key={g.name} className="px-4 py-2.5 flex items-center gap-3">
                        <button
                          onClick={() => toggleSection(g.indices, !allSelected)}
                          className={`w-5 h-5 rounded border flex items-center justify-center text-xs ${allSelected ? "bg-indigo-600 border-indigo-600 text-white" : noneSelected ? "border-zinc-600" : "bg-indigo-600/40 border-indigo-600/60 text-white"}`}
                          title={allSelected ? "Desmarcar todos desta seção" : "Marcar todos desta seção"}
                        >
                          {allSelected ? "✓" : !noneSelected ? "—" : ""}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-zinc-200 truncate">{g.name}</p>
                          <p className="text-xs text-zinc-500">
                            {g.count} {g.count === 1 ? "item" : "itens"}
                            {!g.chargedThisMonth && <span className="ml-2 text-amber-400">não entra no total deste mês</span>}
                          </p>
                        </div>
                        <span className={`text-sm font-medium tabular-nums ${g.total < 0 ? "text-emerald-400" : "text-zinc-200"}`}>
                          {formatCurrency(g.total)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Invoice Analysis */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <button
                onClick={() => setShowAnalysis((v) => !v)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-800/40 transition-colors"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                  <BarChart2 className="w-4 h-4 text-indigo-400" />
                  Análise da Fatura por Categoria
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400">{analysisGroups.length} categorias · {formatCurrency(analysisTotal)}</span>
                  <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${showAnalysis ? "rotate-180" : ""}`} />
                </div>
              </button>
              {showAnalysis && (
                <div className="border-t border-zinc-800 p-4 space-y-2">
                  {analysisGroups.length === 0 ? (
                    <p className="text-xs text-zinc-500 text-center py-4">Nenhum lançamento com categoria definida ainda.</p>
                  ) : (
                    analysisGroups.map((group) => {
                      const pct = analysisTotal > 0 ? (group.total / analysisTotal) * 100 : 0;
                      const isExpanded = expandedCategories.has(group.id);
                      return (
                        <div key={group.id} className="rounded-lg overflow-hidden border border-zinc-800">
                          <button
                            onClick={() => setExpandedCategories((prev) => {
                              const next = new Set(prev);
                              if (next.has(group.id)) next.delete(group.id); else next.add(group.id);
                              return next;
                            })}
                            className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-zinc-800/50 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-zinc-200">{group.name}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs text-zinc-400">{group.merchants.length} estabelecimento{group.merchants.length !== 1 ? "s" : ""}</span>
                                  <span className="text-xs font-semibold text-red-400">{formatCurrency(group.total)}</span>
                                  <span className="text-xs text-zinc-500 w-10 text-right">{pct.toFixed(1)}%</span>
                                </div>
                              </div>
                              <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                                <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                            <ChevronDown className={`w-3.5 h-3.5 text-zinc-600 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          </button>
                          {isExpanded && (
                            <div className="border-t border-zinc-800 bg-zinc-950/40">
                              {group.merchants.map((m, mi) => (
                                <div key={mi} className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/50 last:border-0">
                                  <span className="text-xs text-zinc-300 truncate max-w-[60%]">{m.label}</span>
                                  <div className="flex items-center gap-3 shrink-0">
                                    <span className="text-xs text-zinc-500">{m.count}×</span>
                                    <span className="text-xs font-semibold text-zinc-200">{formatCurrency(m.total)}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Items Table */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-zinc-100">
                  {includedCount} de {items.length} lançamentos selecionados
                </span>
                <div className="flex items-center gap-3">
                  {/* Toggle agrupamento por estabelecimento */}
                  <button
                    onClick={() => setGroupByEstablishment((v) => !v)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      groupByEstablishment
                        ? "bg-indigo-600/15 text-indigo-300 border border-indigo-600/30"
                        : "bg-zinc-800/40 text-zinc-400 border border-zinc-700 hover:bg-zinc-800"
                    }`}
                    title={groupByEstablishment ? "Desligar agrupamento" : "Agrupar por estabelecimento"}
                  >
                    <BarChart2 className="w-3 h-3" />
                    {groupByEstablishment ? `Agrupado (${itemGroups.length})` : "Agrupar"}
                  </button>
                  <span className="text-sm font-semibold text-zinc-300">
                    Total: {formatCurrency(includedTotal)}
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="w-10 px-4 py-2" />
                      <th className="text-left px-4 py-2 text-xs font-semibold text-zinc-500">Data</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-zinc-500">Descrição</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-zinc-500">Parcela</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-zinc-500">Categoria</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-zinc-500">Confiança</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-zinc-500">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupByEstablishment && itemGroups.map((group) => {
                      const isExpanded = expandedGroups.has(group.key);
                      const isSingleton = group.items.length === 1;
                      // Singletons renderizam como linha normal (não vale agrupar 1 item)
                      if (isSingleton) {
                        const item = group.items[0];
                        const i = group.indices[0];
                        return (
                          <tr key={group.key} className={`border-b border-zinc-800/50 transition-colors ${item.include ? "hover:bg-zinc-800/30" : "opacity-40"}`}>
                            <td className="px-4 py-2.5">
                              <button onClick={() => toggleItem(i)} className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${item.include ? "bg-indigo-600 border-indigo-600" : "border-zinc-600 hover:border-zinc-400"}`}>
                                {item.include && <Check className="w-3 h-3 text-white" />}
                              </button>
                            </td>
                            <td className="px-4 py-2.5 text-zinc-400 text-xs whitespace-nowrap">{formatDate(item.date)}</td>
                            <td className="px-4 py-2.5">
                              <p className="text-zinc-200 font-medium text-xs max-w-[220px] truncate">{item.description}</p>
                              {item.establishment && item.establishment !== item.description && (<p className="text-zinc-500 text-xs">{item.establishment}</p>)}
                            </td>
                            <td className="px-4 py-2.5 text-zinc-400 text-xs">{item.installmentInfo || "—"}</td>
                            <td className="px-4 py-2.5 min-w-[180px]">
                              <Select value={item.categoryId ?? ""} onValueChange={(v) => updateCategory(i, v)}>
                                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Categoria..." /></SelectTrigger>
                                <SelectContent>{result.categories.map((cat) => (<SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>))}</SelectContent>
                              </Select>
                            </td>
                            <td className="px-4 py-2.5">
                              {item.categoryId ? (<div className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-emerald-600/15 text-emerald-400">Auto</div>) : (<div className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-zinc-700 text-zinc-500">—</div>)}
                            </td>
                            <td className={`px-4 py-2.5 text-right font-semibold text-sm ${item.amount < 0 ? "text-emerald-400" : "text-red-400"}`}>{formatCurrency(item.amount)}</td>
                          </tr>
                        );
                      }
                      // Grupos com 2+ items: linha-resumo + items expandidos
                      return (
                        <React.Fragment key={group.key}>
                          <tr className={`border-b border-zinc-800/50 bg-zinc-900/40 transition-colors ${group.checkState === "none" ? "opacity-40" : "hover:bg-zinc-800/40"}`}>
                            <td className="px-4 py-2.5">
                              <button
                                onClick={() => toggleGroup(group.key)}
                                className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                                  group.checkState === "all" ? "bg-indigo-600 border-indigo-600"
                                  : group.checkState === "some" ? "bg-indigo-600/30 border-indigo-600"
                                  : "border-zinc-600 hover:border-zinc-400"
                                }`}
                                title={group.checkState === "all" ? "Desmarcar todos" : "Marcar todos"}
                              >
                                {group.checkState === "all" && <Check className="w-3 h-3 text-white" />}
                                {group.checkState === "some" && <span className="w-2 h-0.5 bg-white" />}
                              </button>
                            </td>
                            <td className="px-4 py-2.5 text-zinc-500 text-xs">
                              <button onClick={() => toggleGroupExpanded(group.key)} className="hover:text-zinc-300 flex items-center gap-1">
                                <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
                              </button>
                            </td>
                            <td className="px-4 py-2.5">
                              <p className="text-zinc-100 font-semibold text-xs">{group.label}</p>
                              <p className="text-zinc-500 text-xs">{group.items.length} lançamentos · {group.includedCount} selecionados</p>
                            </td>
                            <td className="px-4 py-2.5 text-zinc-500 text-xs">—</td>
                            <td className="px-4 py-2.5 min-w-[180px]">
                              <Select value={group.majorityCategory ?? ""} onValueChange={(v) => setGroupCategory(group.key, v)}>
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue placeholder="Categoria..." />
                                </SelectTrigger>
                                <SelectContent>{result.categories.map((cat) => (<SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>))}</SelectContent>
                              </Select>
                            </td>
                            <td className="px-4 py-2.5">
                              {group.hasMixedCategories ? (
                                <div className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-amber-600/15 text-amber-400" title="Items com categorias diferentes">Mista</div>
                              ) : group.majorityCategory ? (
                                <div className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-emerald-600/15 text-emerald-400">Grupo</div>
                              ) : (
                                <div className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-zinc-700 text-zinc-500">—</div>
                              )}
                            </td>
                            <td className={`px-4 py-2.5 text-right font-semibold text-sm ${group.total < 0 ? "text-emerald-400" : "text-red-400"}`}>{formatCurrency(group.total)}</td>
                          </tr>
                          {isExpanded && group.indices.map((i) => {
                            const item = items[i];
                            return (
                              <tr key={`${group.key}-${i}`} className={`border-b border-zinc-800/30 bg-zinc-950/30 transition-colors ${item.include ? "hover:bg-zinc-800/20" : "opacity-40"}`}>
                                <td className="px-4 py-2 pl-8">
                                  <button onClick={() => toggleItem(i)} className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${item.include ? "bg-indigo-600 border-indigo-600" : "border-zinc-600 hover:border-zinc-400"}`}>
                                    {item.include && <Check className="w-2.5 h-2.5 text-white" />}
                                  </button>
                                </td>
                                <td className="px-4 py-2 text-zinc-500 text-xs whitespace-nowrap">{formatDate(item.date)}</td>
                                <td className="px-4 py-2">
                                  <p className="text-zinc-300 text-xs max-w-[220px] truncate">{item.description}</p>
                                </td>
                                <td className="px-4 py-2 text-zinc-500 text-xs">{item.installmentInfo || "—"}</td>
                                <td className="px-4 py-2 min-w-[180px]">
                                  <Select value={item.categoryId ?? ""} onValueChange={(v) => updateCategory(i, v)}>
                                    <SelectTrigger className="h-6 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                                    <SelectContent>{result.categories.map((cat) => (<SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>))}</SelectContent>
                                  </Select>
                                </td>
                                <td className="px-4 py-2 text-xs text-zinc-500">item</td>
                                <td className={`px-4 py-2 text-right text-xs ${item.amount < 0 ? "text-emerald-400" : "text-red-400"}`}>{formatCurrency(item.amount)}</td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                    {!groupByEstablishment && items.map((item, i) => (
                      <tr
                        key={i}
                        className={`border-b border-zinc-800/50 transition-colors ${
                          item.include ? "hover:bg-zinc-800/30" : "opacity-40"
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => toggleItem(i)}
                            className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                              item.include
                                ? "bg-indigo-600 border-indigo-600"
                                : "border-zinc-600 hover:border-zinc-400"
                            }`}
                          >
                            {item.include && <Check className="w-3 h-3 text-white" />}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-zinc-400 text-xs whitespace-nowrap">
                          {formatDate(item.date)}
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="text-zinc-200 font-medium text-xs max-w-[220px] truncate">
                            {item.description}
                          </p>
                          {item.establishment && item.establishment !== item.description && (
                            <p className="text-zinc-500 text-xs">{item.establishment}</p>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-zinc-400 text-xs">
                          {item.installmentInfo || "—"}
                        </td>
                        <td className="px-4 py-2.5 min-w-[180px]">
                          <Select
                            value={item.categoryId ?? ""}
                            onValueChange={(v) => updateCategory(i, v)}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="Categoria..." />
                            </SelectTrigger>
                            <SelectContent>
                              {result.categories.map((cat) => (
                                <SelectItem key={cat.id} value={cat.id}>
                                  {cat.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-2.5">
                          {item.confidence != null && !isNaN(item.confidence) ? (
                            <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${
                              item.confidence >= 0.8
                                ? "bg-emerald-600/15 text-emerald-400"
                                : item.confidence >= 0.5
                                ? "bg-amber-600/15 text-amber-400"
                                : "bg-zinc-700 text-zinc-400"
                            }`}>
                              {Math.round(item.confidence * 100)}%
                            </div>
                          ) : (
                            item.categoryId ? (
                              <div className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-emerald-600/15 text-emerald-400">Auto</div>
                            ) : (
                              <div className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-zinc-700 text-zinc-500">—</div>
                            )
                          )}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-semibold text-sm ${
                          item.amount < 0 ? "text-emerald-400" : "text-red-400"
                        }`}>
                          {item.amount < 0 ? (
                            <span title="Crédito / Estorno">
                              {formatCurrency(item.amount)}
                              <span className="ml-1 text-xs font-normal opacity-70">crédito</span>
                            </span>
                          ) : formatCurrency(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Erro na confirmação — fluxo financeiro crítico, fica visível
                na própria revisão sem perder as edições/seleção do usuário. */}
            {error && (
              <div className="flex items-start gap-2 p-4 rounded-lg bg-red-950/50 border border-red-900 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Trava de conciliação — bloqueia importar quando a soma dos itens
                não fecha com o total impresso da fatura (no centavo). */}
            {hasReconciliationIssue && (
              <div className="flex items-start gap-2 p-4 rounded-lg bg-amber-950/40 border border-amber-900/60 text-amber-300 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p>
                    A soma dos {includedCount} itens selecionados é <strong>{formatCurrency(includedTotal)}</strong>,
                    mas o total impresso da fatura é <strong>{formatCurrency(result!.totalAmount)}</strong> —
                    diferença de <strong>{formatCurrency(reconciliationDiff)}</strong>. Revise os itens (algum sobrando,
                    faltando ou com valor errado) antes de importar.
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmAnyway}
                      onChange={(e) => setConfirmAnyway(e.target.checked)}
                      className="rounded"
                    />
                    Importar mesmo assim (estou ciente da diferença)
                  </label>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep("upload")}>
                Voltar
              </Button>
              <Button
                onClick={() => handleConfirm(false)}
                disabled={confirming || includedCount === 0 || (hasReconciliationIssue && !confirmAnyway)}
              >
                {confirming ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Importando...</>
                ) : (
                  <><CheckCircle className="w-4 h-4" /> Confirmar Importação ({includedCount} lançamentos)</>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && confirmed && (
          <div className="max-w-md mx-auto flex flex-col items-center justify-center py-16 space-y-4 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-600/15 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold text-zinc-100">Importação concluída!</h3>
            <div className="space-y-1">
              <p className="text-zinc-300">
                <span className="font-semibold text-emerald-400">{confirmed.created}</span> lançamentos criados com sucesso
              </p>
              {confirmed.skipped > 0 && (
                <p className="text-zinc-500 text-sm">
                  {confirmed.skipped} lançamentos ignorados (duplicatas detectadas)
                </p>
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setStep("upload");
                  setFile(null);
                  setSelectedCard("");
                  setResult(null);
                  setItems([]);
                  setConfirmed(null);
                  setConfirmAnyway(false); // senão a trava fica pré-furada na próxima fatura
                }}
              >
                Nova Importação
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push(`/faturas/${confirmed.invoiceId}`)}
              >
                Ver Fatura
              </Button>
              <Button onClick={() => router.push("/lancamentos")}>
                Ver Lançamentos
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
