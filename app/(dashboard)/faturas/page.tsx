"use client";

import { useState, useRef } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  XCircle,
  Loader2,
  Sparkles,
  AlertCircle,
  CreditCard,
  ChevronRight,
  ChevronDown,
  Check,
  BarChart2,
} from "lucide-react";

interface CreditCardData { id: string; name: string; brand: string; }
interface ExtractedItem {
  date: string;
  description: string;
  amount: number;       // negative for credits/refunds
  isCredit: boolean;
  establishment: string | null;
  installmentInfo: string | null;
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
  const [cards, setCards] = useState<CreditCardData[]>([]);
  const [selectedCard, setSelectedCard] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>("upload");
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState<{ invoiceId: string; created: number; skipped: number } | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  useState(() => {
    fetch("/api/credit-cards").then((r) => r.json()).then((data) => setCards(data));
  });

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }

  async function handleProcess() {
    if (!file || !selectedCard) return;
    setStep("processing");
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("creditCardId", selectedCard);

    try {
      const res = await fetch("/api/invoices/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao processar fatura");
      }

      const data: ExtractionResult = await res.json();
      setResult(data);
      setItems(data.items.map((item) => ({ ...item, include: true })));
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
      setStep("upload");
    }
  }

  async function handleConfirm() {
    if (!result) return;
    setConfirming(true);

    const res = await fetch("/api/invoices/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creditCardId: selectedCard,
        referenceMonth: result.referenceMonth ?? new Date().toISOString().slice(0, 7),
        dueDate: result.dueDate,
        totalAmount: result.totalAmount,
        items,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setConfirmed({
        invoiceId: data.invoiceId,
        created: data.transactionsCreated,
        skipped: data.skippedDuplicates,
      });
      setStep("done");
    }

    setConfirming(false);
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
  const reconciliationDiff = result ? Math.abs(includedTotal - result.totalAmount) : 0;
  const hasReconciliationIssue = result && reconciliationDiff > 0.10;

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

  return (
    <>
      <Header title="Importar Fatura" subtitle="Leitura automática de fatura de cartão via OCR" />
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
        {step === "upload" && (
          <div className="max-w-xl mx-auto space-y-5">
            {error && (
              <div className="flex items-center gap-2 p-4 rounded-lg bg-red-950/50 border border-red-900 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Select Card */}
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

            <Button
              className="w-full"
              onClick={handleProcess}
              disabled={!file || !selectedCard}
              size="lg"
            >
              <Sparkles className="w-4 h-4" />
              Processar com IA
            </Button>
          </div>
        )}

        {/* Step: Processing */}
        {step === "processing" && (
          <div className="max-w-xl mx-auto flex flex-col items-center justify-center py-24 space-y-4">
            <div className="w-16 h-16 rounded-full bg-indigo-600/15 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-100">Processando fatura...</h3>
            <p className="text-sm text-zinc-400 text-center max-w-xs">
              O Claude está lendo e extraindo os lançamentos da sua fatura. Isso pode levar alguns segundos.
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
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-xs text-zinc-500 mb-1">Cartão</p>
                <p className="font-semibold text-zinc-100">{result.creditCard.name}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-xs text-zinc-500 mb-1">Lançamentos extraídos</p>
                <p className="font-semibold text-zinc-100">{result.items.length}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-xs text-zinc-500 mb-1">Total da fatura</p>
                <p className="font-semibold text-zinc-100">{formatCurrency(result.totalAmount)}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-xs text-zinc-500 mb-1">Vencimento</p>
                <p className="font-semibold text-zinc-100">
                  {result.dueDate ? formatDate(result.dueDate) : "—"}
                </p>
              </div>
            </div>

            {/* Tip */}
            <div className="flex items-start gap-2 p-3 bg-indigo-950/40 border border-indigo-900/50 rounded-lg text-xs text-indigo-300">
              <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                Revise os lançamentos abaixo. Itens em <span className="text-emerald-400 font-semibold">verde</span> são créditos/estornos (reduzem o total). Ajuste categorias e desmarque os que não devem ser importados.
              </span>
            </div>

            {/* Reconciliation banner */}
            {hasReconciliationIssue && (
              <div className="flex items-start gap-2 p-3 bg-amber-950/40 border border-amber-900/50 rounded-lg text-xs text-amber-300">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
                <span>
                  <strong>Divergência de {formatCurrency(reconciliationDiff)}:</strong> a soma dos lançamentos selecionados ({formatCurrency(includedTotal)}) difere do total da fatura ({formatCurrency(result!.totalAmount)}).
                  {includedCredits < 0 && ` Inclui ${formatCurrency(Math.abs(includedCredits))} em estornos/créditos.`}
                  {" "}Causas comuns: saldo anterior rotativo incluído no total impresso, parcelas de compras de meses anteriores, encargos/juros, ou ajustes cambiais. Os lançamentos extraídos representam apenas as novas transações do período.
                </span>
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
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <span className="text-sm font-semibold text-zinc-100">
                  {includedCount} de {items.length} lançamentos selecionados
                </span>
                <span className="text-sm font-semibold text-zinc-300">
                  Total: {formatCurrency(includedTotal)}
                </span>
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
                    {items.map((item, i) => (
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

            {/* Actions */}
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep("upload")}>
                Voltar
              </Button>
              <Button onClick={handleConfirm} disabled={confirming || includedCount === 0}>
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
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setStep("upload");
                  setFile(null);
                  setSelectedCard("");
                  setResult(null);
                  setItems([]);
                  setConfirmed(null);
                }}
              >
                Nova Importação
              </Button>
              <Button onClick={() => window.location.href = "/lancamentos"}>
                Ver Lançamentos
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
