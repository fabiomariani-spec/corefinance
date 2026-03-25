"use client";

import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, ArrowUpCircle, ArrowDownCircle, RefreshCw, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";

interface Category { id: string; name: string; color: string; }
interface Department { id: string; name: string; color: string; }
interface Account { id: string; name: string; }
interface CreditCard { id: string; name: string; }
interface Transaction {
  id: string; description: string; amount: number;
  type: "INCOME" | "EXPENSE"; status: string; isPredicted: boolean;
  isRecurring?: boolean;
  competenceDate: string; dueDate: string | null; paymentDate: string | null;
  notes?: string | null;
  category?: { id: string; name: string; color: string } | null;
  department?: { id: string; name: string; color: string } | null;
  contact?: { id: string; name: string } | null;
  account?: { id: string; name: string } | null;
  creditCard?: { id: string; name: string } | null;
}
interface Props {
  open: boolean; onOpenChange: (open: boolean) => void;
  transaction?: Transaction | null; onSuccess: () => void;
}

const EMPTY_FORM = {
  type: "EXPENSE" as "INCOME" | "EXPENSE",
  description: "", amount: 0, status: "PENDING", isPredicted: false,
  categoryId: "", departmentId: "", accountId: "", creditCardId: "",
  competenceDate: new Date().toISOString().split("T")[0],
  dueDate: "", paymentDate: "", paymentMethod: "", notes: "",
  isRecurring: false, tags: [] as string[],
};

const STEPS = [
  { label: "Dados", description: "Tipo, valor e descrição" },
  { label: "Classificação", description: "Categoria, datas e recorrência" },
  { label: "Pagamento", description: "Conta, cartão e observações" },
];

export function TransactionModal({ open, onOpenChange, transaction, onSuccess }: Props) {
  const isEditing = Boolean(transaction?.id);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(EMPTY_FORM);
  const [recurringMonths, setRecurringMonths] = useState("12");
  const [openEnded, setOpenEnded] = useState(false);
  const [dueDayOfMonth, setDueDayOfMonth] = useState("5");
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Propagation dialog: shown when editing a recurring transaction and category/dept changed
  const [showPropagateDialog, setShowPropagateDialog] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setErrors({});
    Promise.all([
      fetch("/api/categories").then((r) => r.json()),
      fetch("/api/departments").then((r) => r.json()),
      fetch("/api/accounts").then((r) => r.json()),
      fetch("/api/credit-cards").then((r) => r.json()),
    ]).then(([cats, depts, accs, cards]) => {
      const flatCats: Category[] = [];
      cats.forEach((c: Category & { children?: Category[] }) => {
        flatCats.push(c);
        if (c.children) flatCats.push(...c.children);
      });
      setCategories(flatCats); setDepartments(depts);
      setAccounts(accs); setCreditCards(cards);
    });
    if (transaction) {
      setForm({
        type: transaction.type, description: transaction.description,
        amount: transaction.amount, status: transaction.status,
        isPredicted: transaction.isPredicted,
        categoryId: transaction.category?.id ?? "",
        departmentId: transaction.department?.id ?? "",
        accountId: transaction.account?.id ?? "",
        creditCardId: transaction.creditCard?.id ?? "",
        competenceDate: transaction.competenceDate?.split("T")[0] ?? "",
        dueDate: transaction.dueDate?.split("T")[0] ?? "",
        paymentDate: transaction.paymentDate?.split("T")[0] ?? "",
        paymentMethod: "", notes: transaction.notes ?? "",
        isRecurring: false, tags: [],
      });
    } else {
      setForm({ ...EMPTY_FORM, competenceDate: new Date().toISOString().split("T")[0] });
      setRecurringMonths("12"); setDueDayOfMonth("5");
    }
  }, [open, transaction]);

  function validateStep(s: number): boolean {
    const newErrors: Record<string, string> = {};
    if (s === 0) {
      if (!form.description.trim()) newErrors.description = "Informe uma descrição";
      if (form.amount <= 0) newErrors.amount = "Informe um valor maior que zero";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleNext() {
    if (validateStep(step)) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function doSave(payload: Record<string, unknown>) {
    setLoading(true);
    const url = isEditing ? `/api/transactions/${transaction!.id}` : "/api/transactions";
    await fetch(url, {
      method: isEditing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    setShowPropagateDialog(false);
    setPendingPayload(null);
    onOpenChange(false);
    onSuccess();
  }

  async function handleSubmit() {
    if (!validateStep(step)) return;
    const payload: Record<string, unknown> = {
      ...form,
      amount: form.amount,
      categoryId: form.categoryId || null,
      departmentId: form.departmentId || null,
      accountId: form.accountId || null,
      creditCardId: form.creditCardId || null,
      dueDate: form.dueDate || null,
      paymentDate: form.paymentDate || null,
      paymentMethod: form.paymentMethod || null,
      notes: form.notes || null,
      ...(form.isRecurring && !isEditing && {
        // openEnded = true → send 0 as signal for "no fixed end" (API generates 120 months)
        recurringMonths: openEnded ? 0 : (parseInt(recurringMonths) || 12),
        dueDayOfMonth: parseInt(dueDayOfMonth) || 5,
        openEnded,
      }),
    };

    // If editing a recurring transaction and category/dept changed, ask about propagation
    if (isEditing && transaction?.isRecurring) {
      const categoryChanged = (form.categoryId || null) !== (transaction?.category?.id ?? null);
      const deptChanged = (form.departmentId || null) !== (transaction?.department?.id ?? null);
      if (categoryChanged || deptChanged) {
        setPendingPayload(payload);
        setShowPropagateDialog(true);
        return;
      }
    }

    await doSave(payload);
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Lançamento" : "Novo Lançamento"}</DialogTitle>
        </DialogHeader>

        {/* Progress Indicator */}
        <div className="flex items-center gap-1 mb-2">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center flex-1">
              <button
                type="button"
                onClick={() => { if (i < step || (i > step && validateStep(step))) setStep(i); }}
                className="flex items-center gap-2 group"
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all shrink-0 ${
                  i < step ? "bg-emerald-600 text-white" :
                  i === step ? "bg-indigo-600 text-white" :
                  "bg-zinc-800 text-zinc-500 group-hover:bg-zinc-700"
                }`}>
                  {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <div className="hidden sm:block text-left">
                  <p className={`text-xs font-medium leading-none ${i === step ? "text-zinc-100" : "text-zinc-500"}`}>
                    {s.label}
                  </p>
                  <p className="text-xs text-zinc-600 leading-none mt-0.5">{s.description}</p>
                </div>
              </button>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-2 ${i < step ? "bg-emerald-600" : "bg-zinc-800"}`} />
              )}
            </div>
          ))}
        </div>

        <div className="min-h-[280px]">
          {/* ── Step 1: Dados principais ── */}
          {step === 0 && (
            <div className="space-y-4">
              {/* Type Toggle */}
              <div className="flex rounded-lg overflow-hidden border border-zinc-700">
                <button type="button" onClick={() => setForm({ ...form, type: "EXPENSE" })}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors border-r border-zinc-700 ${form.type === "EXPENSE" ? "bg-red-600/20 text-red-400" : "text-zinc-500 hover:text-zinc-300"}`}>
                  <ArrowDownCircle className="w-4 h-4" /> Saída
                </button>
                <button type="button" onClick={() => setForm({ ...form, type: "INCOME" })}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${form.type === "INCOME" ? "bg-emerald-600/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"}`}>
                  <ArrowUpCircle className="w-4 h-4" /> Entrada
                </button>
              </div>

              <div className="space-y-1.5">
                <Label>Descrição *</Label>
                <Input placeholder="Ex: Salário - João Silva" value={form.description}
                  onChange={(e) => { setForm({ ...form, description: e.target.value }); setErrors((prev) => { const { description, ...rest } = prev; return rest; }); }}
                  className={errors.description ? "border-red-500 focus:border-red-500" : ""} />
                {errors.description && <p className="text-xs text-red-400">{errors.description}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Valor *</Label>
                  <CurrencyInput
                    value={form.amount}
                    onChange={(n) => { setForm({ ...form, amount: n }); setErrors((prev) => { const { amount, ...rest } = prev; return rest; }); }}
                  />
                  {errors.amount && <p className="text-xs text-red-400">{errors.amount}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PENDING">Pendente</SelectItem>
                      <SelectItem value="PREDICTED">Previsto</SelectItem>
                      <SelectItem value="PAID">Pago</SelectItem>
                      <SelectItem value="RECEIVED">Recebido</SelectItem>
                      <SelectItem value="OVERDUE">Atrasado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Classificação ── */}
          {step === 1 && (
            <div className="space-y-4">
              {/* Category + Department */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Categoria</Label>
                  <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Departamento</Label>
                  <Select value={form.departmentId} onValueChange={(v) => setForm({ ...form, departmentId: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Competência *</Label>
                  <Input type="date" value={form.competenceDate}
                    onChange={(e) => setForm({ ...form, competenceDate: e.target.value })} required />
                </div>
                <div className="space-y-1.5">
                  <Label>{form.isRecurring && !isEditing ? "Venc. 1ª parcela" : "Vencimento"}</Label>
                  <Input type="date" value={form.dueDate}
                    onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Pagamento</Label>
                  <Input type="date" value={form.paymentDate}
                    onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} />
                </div>
              </div>

              {/* Recurring Toggle — create only */}
              {!isEditing && (
                <div className={`rounded-xl border transition-all ${form.isRecurring ? "border-indigo-600/50 bg-indigo-600/5" : "border-zinc-700 bg-zinc-800/30"}`}>
                  <button type="button" onClick={() => setForm({ ...form, isRecurring: !form.isRecurring })}
                    className="w-full flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <RefreshCw className={`w-4 h-4 ${form.isRecurring ? "text-indigo-400" : "text-zinc-500"}`} />
                      <div className="text-left">
                        <p className={`text-sm font-medium ${form.isRecurring ? "text-indigo-300" : "text-zinc-300"}`}>
                          Pagamento Recorrente Mensal
                        </p>
                        <p className="text-xs text-zinc-500">Salários, aluguel, assinaturas fixas</p>
                      </div>
                    </div>
                    <div className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${form.isRecurring ? "bg-indigo-600" : "bg-zinc-700"}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.isRecurring ? "translate-x-5" : "translate-x-0.5"}`} />
                    </div>
                  </button>
                  {form.isRecurring && (
                    <div className="px-4 pb-4 border-t border-indigo-600/20 pt-3 grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Dia do vencimento (1–28)</Label>
                        <Input type="number" min="1" max="28" placeholder="5" value={dueDayOfMonth}
                          onChange={(e) => setDueDayOfMonth(e.target.value)} className="text-center" />
                        <p className="text-xs text-zinc-600">Ex: dia 5 de cada mês</p>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Repetir por quantos meses</Label>
                          <label className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={openEnded}
                              onChange={(e) => setOpenEnded(e.target.checked)}
                              className="w-3.5 h-3.5 accent-indigo-500"
                            />
                            <span className="text-xs text-zinc-400">Sem prazo</span>
                          </label>
                        </div>
                        <Select
                          value={recurringMonths}
                          onValueChange={setRecurringMonths}
                          disabled={openEnded}
                        >
                          <SelectTrigger className={openEnded ? "opacity-40" : ""}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="3">3 meses</SelectItem>
                            <SelectItem value="6">6 meses</SelectItem>
                            <SelectItem value="12">12 meses</SelectItem>
                            <SelectItem value="24">24 meses</SelectItem>
                            <SelectItem value="36">36 meses</SelectItem>
                            <SelectItem value="60">60 meses</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-zinc-500">
                          {openEnded
                            ? <span className="text-violet-400 font-medium">Sem prazo definido — cancele manualmente quando quiser</span>
                            : <><strong className="text-indigo-400">{recurringMonths} lançamentos</strong> pendentes serão criados</>
                          }
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Pagamento ── */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Account + CreditCard */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Conta Bancária</Label>
                  <Select value={form.accountId} onValueChange={(v) => setForm({ ...form, accountId: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Cartão de Crédito</Label>
                  <Select value={form.creditCardId} onValueChange={(v) => setForm({ ...form, creditCardId: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      {creditCards.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Payment Method */}
              <div className="space-y-1.5">
                <Label>Forma de Pagamento</Label>
                <Select value={form.paymentMethod} onValueChange={(v) => setForm({ ...form, paymentMethod: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PIX">PIX</SelectItem>
                    <SelectItem value="BANK_TRANSFER">Transferência Bancária</SelectItem>
                    <SelectItem value="BOLETO">Boleto</SelectItem>
                    <SelectItem value="CREDIT_CARD">Cartão de Crédito</SelectItem>
                    <SelectItem value="DEBIT_CARD">Cartão de Débito</SelectItem>
                    <SelectItem value="CASH">Dinheiro</SelectItem>
                    <SelectItem value="CHECK">Cheque</SelectItem>
                    <SelectItem value="OTHER">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label>Observações</Label>
                <Textarea placeholder="Informações adicionais..." value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
              </div>
            </div>
          )}
        </div>

        {/* Footer with navigation */}
        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
          <div>
            {step > 0 && (
              <Button type="button" variant="outline" onClick={handleBack} className="gap-1">
                <ChevronLeft className="w-4 h-4" /> Voltar
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={handleNext} className="gap-1">
                Próximo <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button type="button" onClick={handleSubmit} disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white border-0">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
                  : isEditing ? "Salvar"
                  : form.isRecurring ? `Criar ${recurringMonths} Lançamentos`
                  : "Criar Lançamento"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* ── Propagation Dialog ─────────────────────────────────────────────── */}
    <Dialog open={showPropagateDialog} onOpenChange={setShowPropagateDialog}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <RefreshCw className="w-4 h-4 text-indigo-400" />
            Lançamento Recorrente
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <p className="text-sm text-zinc-300">
            Você alterou a <strong className="text-white">categoria</strong> ou <strong className="text-white">departamento</strong> de um lançamento recorrente.
          </p>
          <p className="text-sm text-zinc-400">
            Deseja aplicar essa mudança nos próximos lançamentos pendentes também?
          </p>
        </div>
        <DialogFooter className="flex flex-col gap-2 sm:flex-col">
          <Button
            onClick={() => pendingPayload && doSave({ ...pendingPayload, propagateFuture: true })}
            disabled={loading}
            className="w-full"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Este e os próximos pendentes
          </Button>
          <Button
            variant="outline"
            onClick={() => pendingPayload && doSave(pendingPayload)}
            disabled={loading}
            className="w-full"
          >
            <Check className="w-4 h-4" />
            Só este lançamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
