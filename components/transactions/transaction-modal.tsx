"use client";

import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Loader2, ArrowUpCircle, ArrowDownCircle, RefreshCw, ChevronLeft, ChevronRight, Check, AlertCircle, FileClock, X } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";
import { SmartDateInput } from "@/components/ui/smart-date-input";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { cachedFetch } from "@/lib/cached-fetch";
import { toast } from "@/lib/toast";

// ── localStorage keys ─────────────────────────────────────────────────────
const DEFAULTS_KEY = (type: "INCOME" | "EXPENSE") => `core-finance:tx-defaults:${type}`;
const DRAFT_KEY = "core-finance:tx-draft";
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

interface TxDefaults {
  categoryId?: string;
  departmentId?: string;
  accountId?: string;
  creditCardId?: string;
}

function loadDefaults(type: "INCOME" | "EXPENSE"): TxDefaults {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DEFAULTS_KEY(type));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object") ? parsed as TxDefaults : {};
  } catch { return {}; }
}

function saveDefaults(type: "INCOME" | "EXPENSE", defaults: TxDefaults) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEFAULTS_KEY(type), JSON.stringify(defaults));
  } catch { /* quota / privacy mode */ }
}

interface DraftPayload { form: Record<string, unknown>; timestamp: number; }

function loadDraft(): DraftPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftPayload;
    if (!parsed || typeof parsed !== "object" || !parsed.form || !parsed.timestamp) return null;
    if (Date.now() - parsed.timestamp > DRAFT_MAX_AGE_MS) {
      window.localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return parsed;
  } catch { return null; }
}

function saveDraft(form: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    const payload: DraftPayload = { form, timestamp: Date.now() };
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  } catch { /* quota / privacy mode */ }
}

function clearDraft() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
}

interface Category { id: string; name: string; color: string; }
interface Department { id: string; name: string; color: string; }
interface Account { id: string; name: string; }
interface CreditCard { id: string; name: string; }
interface Employee { id: string; name: string; }
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
  employee?: { id: string; name: string } | null;
}
interface Props {
  open: boolean; onOpenChange: (open: boolean) => void;
  transaction?: Transaction | null; onSuccess: () => void;
}

const EMPTY_FORM = {
  type: "EXPENSE" as "INCOME" | "EXPENSE",
  description: "", amount: 0, status: "PENDING", isPredicted: false,
  categoryId: "", departmentId: "", employeeId: "", accountId: "", creditCardId: "",
  competenceDate: new Date().toISOString().split("T")[0],
  dueDate: "", paymentDate: "", paymentMethod: "", notes: "",
  isRecurring: false, tags: [] as string[],
};

// Map field name → which step it belongs to (for error → jump to step)
const FIELD_SECTION: Record<string, "data" | "classification" | "payment"> = {
  description: "data",
  amount: "data",
  competenceDate: "data",
};

// Stepper: passos do modal (Dados → Classificação → Pagamento)
const STEPS = [
  { key: "data" as const, title: "Dados" },
  { key: "classification" as const, title: "Classificação" },
  { key: "payment" as const, title: "Pagamento" },
];

export function TransactionModal({ open, onOpenChange, transaction, onSuccess }: Props) {
  const isEditing = Boolean(transaction?.id);
  const [form, setForm] = useState(EMPTY_FORM);
  const [recurringMonths, setRecurringMonths] = useState("12");
  const [openEnded, setOpenEnded] = useState(false);
  const [dueDayOfMonth, setDueDayOfMonth] = useState("5");
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<"WEEKLY" | "BIWEEKLY" | "MONTHLY">("MONTHLY");
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Stepper: passo atual (0=Dados, 1=Classificação, 2=Pagamento)
  const [step, setStep] = useState(0);

  // Refs for focus on validation
  const descriptionRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const competenceRef = useRef<HTMLInputElement>(null);
  // Container do conteúdo do passo — recebe foco ao trocar de passo (a11y).
  const stepContentRef = useRef<HTMLDivElement>(null);

  // Propagation dialog: shown when editing a recurring transaction and category/dept changed
  const [showPropagateDialog, setShowPropagateDialog] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null);

  // Draft restore banner
  const [pendingDraft, setPendingDraft] = useState<DraftPayload | null>(null);

  // Track previous type to detect manual switch (apply defaults on toggle)
  const prevTypeRef = useRef<"INCOME" | "EXPENSE" | null>(null);
  // Skip the very first auto-apply-on-type-change after open (defaults already applied)
  const skipNextTypeApplyRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setStep(0);
    setPendingDraft(null);
    Promise.all([
      cachedFetch<(Category & { children?: Category[] })[]>("/api/categories"),
      cachedFetch<Department[]>("/api/departments"),
      cachedFetch<Account[]>("/api/accounts"),
      cachedFetch<CreditCard[]>("/api/credit-cards"),
      cachedFetch<{ employees: Employee[] }>("/api/employees?status=ACTIVE"),
    ]).then((results) => {
      const cats = results[0] as (Category & { children?: Category[] })[];
      const depts = results[1] as Department[];
      const accs = results[2] as Account[];
      const cards = results[3] as CreditCard[];
      const emps = results[4] as { employees: Employee[] };
      const flatCats: Category[] = [];
      cats.forEach((c) => {
        flatCats.push(c);
        if (c.children) flatCats.push(...c.children);
      });
      setCategories(flatCats); setDepartments(depts);
      setAccounts(accs); setCreditCards(cards);
      setEmployees(Array.isArray(emps?.employees) ? emps.employees : []);
    });
    if (transaction) {
      setForm({
        type: transaction.type, description: transaction.description,
        amount: transaction.amount, status: transaction.status,
        isPredicted: transaction.isPredicted,
        categoryId: transaction.category?.id ?? "",
        departmentId: transaction.department?.id ?? "",
        employeeId: transaction.employee?.id ?? "",
        accountId: transaction.account?.id ?? "",
        creditCardId: transaction.creditCard?.id ?? "",
        competenceDate: transaction.competenceDate?.split("T")[0] ?? "",
        dueDate: transaction.dueDate?.split("T")[0] ?? "",
        paymentDate: transaction.paymentDate?.split("T")[0] ?? "",
        paymentMethod: "", notes: transaction.notes ?? "",
        isRecurring: false, tags: [],
      });
      prevTypeRef.current = transaction.type;
      skipNextTypeApplyRef.current = true;
    } else {
      // NEW modal: apply smart defaults (last used) for default type (EXPENSE)
      const defaults = loadDefaults("EXPENSE");
      setForm({
        ...EMPTY_FORM,
        competenceDate: new Date().toISOString().split("T")[0],
        categoryId: defaults.categoryId ?? "",
        departmentId: defaults.departmentId ?? "",
        accountId: defaults.accountId ?? "",
        creditCardId: defaults.creditCardId ?? "",
      });
      setRecurringMonths("12"); setDueDayOfMonth("5"); setRecurrenceFrequency("MONTHLY"); setOpenEnded(false);
      prevTypeRef.current = "EXPENSE";
      skipNextTypeApplyRef.current = true;
      // Check for draft (only NEW modal)
      const draft = loadDraft();
      if (draft) setPendingDraft(draft);
    }
  }, [open, transaction]);

  // ── Re-apply defaults when user switches type (saída ↔ entrada) on NEW modal ──
  useEffect(() => {
    if (!open || isEditing) return;
    if (skipNextTypeApplyRef.current) {
      skipNextTypeApplyRef.current = false;
      prevTypeRef.current = form.type;
      return;
    }
    if (prevTypeRef.current === form.type) return;
    prevTypeRef.current = form.type;
    const defaults = loadDefaults(form.type);
    setForm((prev) => ({
      ...prev,
      categoryId: defaults.categoryId ?? "",
      departmentId: defaults.departmentId ?? "",
      accountId: defaults.accountId ?? "",
      creditCardId: defaults.creditCardId ?? "",
    }));
  }, [form.type, open, isEditing]);

  // ── Draft auto-save (debounced 500ms, NEW modal only, no pending draft banner) ──
  useEffect(() => {
    if (!open || isEditing || pendingDraft) return;
    const t = window.setTimeout(() => {
      // Skip empty drafts (untouched form)
      const isEmpty = !form.description.trim() && form.amount === 0 && !form.notes;
      if (isEmpty) return;
      saveDraft(form as unknown as Record<string, unknown>);
    }, 500);
    return () => window.clearTimeout(t);
  }, [form, open, isEditing, pendingDraft]);

  // ── Foco ao trocar de passo (a11y) ──
  // Sem isso, ao mudar `step` o foco caía no <body> e o leitor de tela /
  // navegação por teclado perdia o contexto. Movemos o foco pro container do
  // passo. No Passo 1 (abertura), o input de descrição tem autoFocus próprio —
  // então só movemos foco pro container nos passos seguintes.
  useEffect(() => {
    if (!open) return;
    if (step === 0) return; // deixa o autoFocus da descrição agir
    stepContentRef.current?.focus();
  }, [step, open]);

  function validate(): Record<string, string> {
    const newErrors: Record<string, string> = {};
    if (!form.description.trim()) newErrors.description = "Informe uma descrição";
    if (form.amount <= 0) newErrors.amount = "Informe um valor maior que zero";
    if (!form.competenceDate) newErrors.competenceDate = "Informe a competência";
    return newErrors;
  }

  // ── Per-field validation: inlined inside handleBlur for stable hook deps ──
  const handleBlur = useCallback((field: "description" | "amount" | "competenceDate") => {
    let err: string | null = null;
    if (field === "description" && !form.description.trim()) err = "Informe uma descrição";
    else if (field === "amount" && form.amount <= 0) err = "Informe um valor maior que zero";
    else if (field === "competenceDate" && !form.competenceDate) err = "Informe a competência";
    setErrors((prev) => {
      const { [field]: _omit, ...rest } = prev;
      void _omit;
      return err ? { ...rest, [field]: err } : rest;
    });
  }, [form.description, form.amount, form.competenceDate]);

  const clearFieldError = useCallback((field: string) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const { [field]: _omit, ...rest } = prev;
      void _omit;
      return rest;
    });
  }, []);

  function stepHasError(stepIndex: number): boolean {
    const key = STEPS[stepIndex].key;
    return Object.keys(errors).some((field) => FIELD_SECTION[field] === key);
  }

  // Goal-Gradient: marca o passo como concluído quando seus campos estão ok.
  function stepDone(stepIndex: number): boolean {
    const key = STEPS[stepIndex].key;
    // "Dados" agora inclui Competência (obrigatória) além de descrição + valor.
    if (key === "data") return Boolean(form.description.trim() && form.amount > 0 && form.competenceDate);
    // "Classificação" passou a ser totalmente opcional — marca como concluído
    // quando o usuário definiu ao menos uma classificação.
    if (key === "classification") return Boolean(form.categoryId || form.departmentId || form.employeeId);
    return Boolean(form.accountId || form.creditCardId || form.paymentMethod);
  }

  // Marca passos que contêm algum campo obrigatório (Dados, Classificação).
  function stepRequired(stepIndex: number): boolean {
    return Object.values(FIELD_SECTION).includes(STEPS[stepIndex].key);
  }

  function focusFirstError(errs: Record<string, string>) {
    setTimeout(() => {
      if (errs.description) descriptionRef.current?.focus();
      else if (errs.amount) amountRef.current?.focus();
      else if (errs.competenceDate) competenceRef.current?.focus();
    }, 50);
  }

  // "Próximo": valida só os obrigatórios do passo atual antes de avançar.
  function goNext() {
    const all = validate();
    const key = STEPS[step].key;
    const stepErrors = Object.fromEntries(
      Object.entries(all).filter(([f]) => FIELD_SECTION[f] === key)
    );
    if (Object.keys(stepErrors).length > 0) {
      setErrors((prev) => ({ ...prev, ...stepErrors }));
      focusFirstError(stepErrors);
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function doSave(payload: Record<string, unknown>) {
    setLoading(true);
    const url = isEditing ? `/api/transactions/${transaction!.id}` : "/api/transactions";
    const res = await fetch(url, {
      method: isEditing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (!res.ok) {
      // Doherty: nunca deixar a ação sem resposta — feedback imediato de falha.
      toast.error("Não foi possível salvar. Verifique a conexão e tente de novo.");
      return; // keep modal open + draft intact on failure
    }
    // Persist smart defaults (per type) on successful NEW save
    if (!isEditing) {
      saveDefaults(form.type, {
        categoryId: form.categoryId || undefined,
        departmentId: form.departmentId || undefined,
        accountId: form.accountId || undefined,
        creditCardId: form.creditCardId || undefined,
      });
      clearDraft();
    }
    setShowPropagateDialog(false);
    setPendingPayload(null);
    onOpenChange(false);
    // Peak-End: fechar com feedback positivo memorável (o pai só refaz o fetch).
    toast.success(
      isEditing
        ? "Lançamento atualizado"
        : form.isRecurring
          ? (openEnded ? "Recorrência criada" : `${recurringMonths} lançamentos criados`)
          : "Lançamento criado"
    );
    onSuccess();
  }

  async function handleSubmit() {
    const newErrors = validate();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      // Pula pro primeiro passo com erro + foca o primeiro campo inválido.
      const firstErrStep = STEPS.findIndex((s) =>
        Object.keys(newErrors).some((f) => FIELD_SECTION[f] === s.key)
      );
      if (firstErrStep >= 0) setStep(firstErrStep);
      focusFirstError(newErrors);
      return;
    }

    const payload: Record<string, unknown> = {
      ...form,
      amount: form.amount,
      categoryId: form.categoryId || null,
      departmentId: form.departmentId || null,
      employeeId: form.employeeId || null,
      accountId: form.accountId || null,
      creditCardId: form.creditCardId || null,
      dueDate: form.dueDate || null,
      paymentDate: form.paymentDate || null,
      paymentMethod: form.paymentMethod || null,
      notes: form.notes || null,
      ...(form.isRecurring && !isEditing && {
        recurringMonths: openEnded ? 0 : (parseInt(recurringMonths) || 12),
        dueDayOfMonth: parseInt(dueDayOfMonth) || 5,
        openEnded,
        recurrenceFrequency,
      }),
    };

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

  function restoreDraft() {
    if (!pendingDraft) return;
    const f = pendingDraft.form as Partial<typeof EMPTY_FORM>;
    setForm({
      ...EMPTY_FORM,
      ...f,
      type: (f.type === "INCOME" || f.type === "EXPENSE") ? f.type : "EXPENSE",
      tags: Array.isArray(f.tags) ? f.tags : [],
    } as typeof EMPTY_FORM);
    // After restoring, prevent the type-effect from clobbering the restored selections
    prevTypeRef.current = (f.type === "INCOME" || f.type === "EXPENSE") ? f.type : "EXPENSE";
    skipNextTypeApplyRef.current = true;
    setPendingDraft(null);
  }

  function discardDraft() {
    clearDraft();
    setPendingDraft(null);
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Lançamento" : "Novo Lançamento"}</DialogTitle>
        </DialogHeader>

        {/* ── Stepper: progresso dos passos (clicável) ── */}
        <div className="flex items-center gap-1 px-1">
          {STEPS.map((s, i) => {
            const active = step === i;
            const err = stepHasError(i);
            const done = !active && stepDone(i);
            return (
              <Fragment key={s.key}>
                <button
                  type="button"
                  onClick={() => setStep(i)}
                  aria-current={active ? "step" : undefined}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${active ? "bg-indigo-600/15" : "hover:bg-zinc-800/60"}`}
                >
                  <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold shrink-0 ${
                    err ? "bg-red-600/20 text-red-400 ring-1 ring-red-600/50"
                    : active ? "bg-indigo-600 text-white"
                    : done ? "bg-emerald-600/20 text-emerald-400"
                    : "bg-zinc-800 text-zinc-500"
                  }`}>
                    {err ? <AlertCircle className="w-3.5 h-3.5" /> : done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </span>
                  <span className={`text-sm font-medium hidden sm:block ${active ? "text-indigo-300" : err ? "text-red-400" : "text-zinc-400"}`}>
                    {s.title}{stepRequired(i) && <span className="text-indigo-400"> *</span>}
                  </span>
                </button>
                {i < STEPS.length - 1 && <div className="flex-1 h-px bg-zinc-800" />}
              </Fragment>
            );
          })}
        </div>

        <div
          ref={stepContentRef}
          tabIndex={-1}
          aria-live="polite"
          className="flex-1 overflow-y-auto -mx-6 px-6 pt-1 outline-none"
          onKeyDown={(e) => {
            // Flow/Doherty: salvar de qualquer campo sem tirar a mão do teclado.
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              handleSubmit();
            }
          }}
        >
          {/* ── Draft restore banner (NEW modal only, passo 1) ── */}
          {!isEditing && pendingDraft && step === 0 && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-indigo-600/40 bg-indigo-600/10 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileClock className="w-4 h-4 text-indigo-400 shrink-0" />
                <p className="text-xs text-indigo-200 truncate">
                  Rascunho não salvo de um lançamento anterior.
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={restoreDraft}
                  className="text-xs font-medium text-indigo-200 bg-indigo-600/30 hover:bg-indigo-600/50 px-2.5 py-1.5 rounded transition-colors"
                >
                  Restaurar
                </button>
                <button
                  type="button"
                  onClick={discardDraft}
                  aria-label="Descartar rascunho"
                  className="flex items-center justify-center min-w-[36px] min-h-[36px] -m-1 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Passo 1: Dados ── */}
          {step === 0 && (
            <div className="space-y-4 py-1">
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
                  <Input
                    ref={descriptionRef}
                    autoFocus
                    placeholder="Ex: Salário - João Silva"
                    value={form.description}
                    onChange={(e) => { setForm({ ...form, description: e.target.value }); clearFieldError("description"); }}
                    onBlur={() => handleBlur("description")}
                    className={errors.description ? "border-red-500 focus:border-red-500" : ""}
                  />
                  {errors.description && <p className="text-xs text-red-400">{errors.description}</p>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Valor *</Label>
                    <CurrencyInput
                      inputRef={amountRef}
                      value={form.amount}
                      onChange={(n) => { setForm({ ...form, amount: n }); clearFieldError("amount"); }}
                      onBlur={() => handleBlur("amount")}
                    />
                    {errors.amount && <p className="text-xs text-red-400">{errors.amount}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PENDING">Pendente (padrão)</SelectItem>
                        <SelectItem value="PREDICTED">Previsto</SelectItem>
                        <SelectItem value="PAID">Pago</SelectItem>
                        <SelectItem value="RECEIVED">Recebido</SelectItem>
                        <SelectItem value="OVERDUE">Atrasado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Datas — movidas pro Passo 1 porque Competência é obrigatória:
                    o usuário precisa vê-la antes de avançar. */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-zinc-400">Datas</p>
                  <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      Competência *
                      <InfoTooltip size="sm" className="p-1.5 -m-1.5" text="Mês em que o lançamento foi gerado/contratado (não confundir com vencimento). Ex: salário de janeiro tem competência jan, mesmo que o pagamento caia em fevereiro." />
                    </Label>
                    <SmartDateInput
                      inputRef={competenceRef}
                      value={form.competenceDate}
                      onChange={(iso) => { setForm({ ...form, competenceDate: iso }); clearFieldError("competenceDate"); }}
                      onBlur={() => handleBlur("competenceDate")}
                      invalid={Boolean(errors.competenceDate)}
                      required
                    />
                    {errors.competenceDate && <p className="text-xs text-red-400">{errors.competenceDate}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      {form.isRecurring && !isEditing ? "Venc. 1ª parcela" : "Vencimento"}
                      <InfoTooltip size="sm" className="p-1.5 -m-1.5" text="Data limite pra pagar (ou receber) o valor. Após essa data o lançamento entra em atraso." />
                    </Label>
                    <SmartDateInput
                      value={form.dueDate}
                      onChange={(iso) => setForm({ ...form, dueDate: iso })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      Pagamento
                      <InfoTooltip size="sm" className="p-1.5 -m-1.5" text="Data efetiva em que o dinheiro entrou ou saiu da conta. Preenchido só depois que o pagamento foi feito de fato." />
                    </Label>
                    <SmartDateInput
                      value={form.paymentDate}
                      onChange={(iso) => setForm({ ...form, paymentDate: iso })}
                    />
                  </div>
                  </div>
                </div>
            </div>
          )}

          {/* ── Passo 2: Classificação ── */}
          {step === 1 && (
            <div className="space-y-4 py-1">
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

                <div className="space-y-1.5">
                  <Label>Colaborador (opcional)</Label>
                  <SearchableSelect
                    value={form.employeeId}
                    onChange={(v) => setForm({ ...form, employeeId: v })}
                    options={employees.map((e) => ({ value: e.id, label: e.name }))}
                    placeholder="Selecionar colaborador..."
                    allowEmpty
                    emptyLabel="— Sem colaborador —"
                  />
                  <p className="text-xs text-zinc-500">Use pra atribuir esse lançamento a uma pessoa (ex: vale, bônus, reembolso)</p>
                </div>

                {!isEditing && (
                  <div className={`rounded-lg border transition-all ${form.isRecurring ? "border-indigo-600/50 bg-indigo-600/5" : "border-zinc-700 bg-zinc-800/30"}`}>
                    <button type="button" onClick={() => setForm({ ...form, isRecurring: !form.isRecurring })}
                      className="w-full flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <RefreshCw className={`w-4 h-4 ${form.isRecurring ? "text-indigo-400" : "text-zinc-500"}`} />
                        <div className="text-left">
                          <p className={`text-sm font-medium ${form.isRecurring ? "text-indigo-300" : "text-zinc-300"}`}>
                            Pagamento Recorrente
                          </p>
                          <p className="text-xs text-zinc-500">Semanal, quinzenal ou mensal — salários, aluguel, assinaturas</p>
                        </div>
                      </div>
                      <div className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${form.isRecurring ? "bg-indigo-600" : "bg-zinc-700"}`}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.isRecurring ? "translate-x-5" : "translate-x-0.5"}`} />
                      </div>
                    </button>
                    {form.isRecurring && (() => {
                      // Rótulos por frequência (gênero correto em PT-BR).
                      const isMonthly = recurrenceFrequency === "MONTHLY";
                      const repeatLabel =
                        recurrenceFrequency === "WEEKLY" ? "Repetir por quantas semanas"
                        : recurrenceFrequency === "BIWEEKLY" ? "Repetir por quantas quinzenas"
                        : "Repetir por quantos meses";
                      const warnThreshold =
                        recurrenceFrequency === "WEEKLY" ? 104
                        : recurrenceFrequency === "BIWEEKLY" ? 52
                        : 60;
                      const count = parseInt(recurringMonths) || 0;
                      // Estimativa de duração pra orientar semanal/quinzenal.
                      const spanMonths = recurrenceFrequency === "WEEKLY"
                        ? Math.round((count * 7) / 30)
                        : recurrenceFrequency === "BIWEEKLY"
                          ? Math.round((count * 14) / 30)
                          : count;
                      return (
                      <div className="px-4 pb-4 border-t border-indigo-600/20 pt-3 space-y-3">
                        {/* Frequência */}
                        <div className="space-y-1.5">
                          <Label className="text-xs">Frequência</Label>
                          <Select value={recurrenceFrequency} onValueChange={(v) => setRecurrenceFrequency(v as "WEEKLY" | "BIWEEKLY" | "MONTHLY")}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="WEEKLY">Semanal (a cada 7 dias)</SelectItem>
                              <SelectItem value="BIWEEKLY">Quinzenal (a cada 14 dias)</SelectItem>
                              <SelectItem value="MONTHLY">Mensal</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          {isMonthly && (
                            <div className="space-y-1.5">
                              <Label className="text-xs">Dia do vencimento (1–31)</Label>
                              <Input type="number" min="1" max="31" placeholder="5" value={dueDayOfMonth}
                                onChange={(e) => setDueDayOfMonth(e.target.value)} className="text-center" />
                              <p className="text-xs text-zinc-600">
                                Em meses sem o dia escolhido (ex: 31 em fevereiro), cai no último dia do mês.
                                Se cair em sáb/dom, antecipa pra sexta.
                              </p>
                            </div>
                          )}
                          <div className={`space-y-1.5 ${isMonthly ? "" : "col-span-2"}`}>
                            <div className="flex items-center justify-between">
                              <Label className="text-xs">{repeatLabel}</Label>
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
                            <Input
                              type="number"
                              min="1"
                              max="600"
                              placeholder="12"
                              value={recurringMonths}
                              onChange={(e) => setRecurringMonths(e.target.value)}
                              disabled={openEnded}
                              className={`text-center ${openEnded ? "opacity-40" : ""}`}
                            />
                            <p className="text-xs text-zinc-500">
                              {openEnded
                                ? <span className="text-violet-400 font-medium">Sem prazo definido — cancele manualmente quando quiser</span>
                                : <>
                                    <strong className="text-indigo-400">{recurringMonths} lançamentos</strong> pendentes serão criados
                                    {!isMonthly && count > 0 && spanMonths > 0 && <> (≈ {spanMonths} {spanMonths === 1 ? "mês" : "meses"})</>}
                                  </>
                              }
                              {!openEnded && count > warnThreshold && (
                                <span className="mt-1 block text-amber-400">
                                  Isso cria muitos lançamentos. Confirme se é o esperado.
                                </span>
                              )}
                            </p>
                            {!isMonthly && (
                              <p className="text-xs text-zinc-600">
                                A partir do vencimento da 1ª parcela (ou da competência, se vazio). Se cair em sáb/dom, antecipa pra sexta.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      );
                    })()}
                  </div>
                )}
            </div>
          )}

          {/* ── Passo 3: Pagamento ── */}
          {step === 2 && (
            <div className="space-y-4 py-1">
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

                <div className="space-y-1.5">
                  <Label>Forma de Pagamento</Label>
                  <Select value={form.paymentMethod} onValueChange={(v) => setForm({ ...form, paymentMethod: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Instantâneo</SelectLabel>
                        <SelectItem value="PIX">PIX</SelectItem>
                        <SelectItem value="MERCADO_PAGO">Mercado Pago</SelectItem>
                        <SelectItem value="CASH">Dinheiro</SelectItem>
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>Cartão</SelectLabel>
                        <SelectItem value="CREDIT_CARD">Cartão de Crédito</SelectItem>
                        <SelectItem value="DEBIT_CARD">Cartão de Débito</SelectItem>
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>Bancário</SelectLabel>
                        <SelectItem value="BANK_TRANSFER">Transferência Bancária</SelectItem>
                        <SelectItem value="BOLETO">Boleto</SelectItem>
                        <SelectItem value="CHECK">Cheque</SelectItem>
                      </SelectGroup>
                      <SelectItem value="OTHER">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Observações</Label>
                  <Textarea placeholder="Informações adicionais..." value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} maxLength={500} />
                  <p className="text-right text-xs text-zinc-500">{form.notes.length}/500</p>
                </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
          {/* Zeigarnik: no último passo mostra o que falta (ou "pronto"). */}
          {step === STEPS.length - 1 && (() => {
            const missing = Object.keys(validate());
            if (missing.length === 0) {
              return (
                <p className="mr-auto flex items-center gap-1.5 text-xs text-emerald-400">
                  <Check className="w-3.5 h-3.5" /> Pronto para salvar
                </p>
              );
            }
            return (
              <p className="mr-auto flex items-center gap-1.5 text-xs text-amber-400">
                <AlertCircle className="w-3.5 h-3.5" />
                {missing.length === 1 ? "Falta 1 campo obrigatório" : `Faltam ${missing.length} campos obrigatórios`}
              </p>
            );
          })()}
          {/* Indicador de passo nas etapas iniciais. */}
          {step < STEPS.length - 1 && (
            <p className="mr-auto text-xs text-zinc-500">Passo {step + 1} de {STEPS.length}</p>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              // Cancelar = descarta rascunho silenciosamente (apenas no modal NEW).
              // Fechar via X / Escape preserva o rascunho.
              if (!isEditing) clearDraft();
              onOpenChange(false);
            }}
          >
            Cancelar
          </Button>
          {step > 0 && (
            <Button type="button" variant="outline" onClick={goBack} className="gap-1.5">
              <ChevronLeft className="w-4 h-4" /> Voltar
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={goNext}
              className="bg-indigo-600 hover:bg-indigo-700 text-white border-0 gap-1.5">
              Próximo <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button type="button" onClick={handleSubmit} disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white border-0 gap-2">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
                : isEditing ? "Salvar"
                : form.isRecurring ? `Criar ${recurringMonths} Lançamentos`
                : "Criar Lançamento"}
            </Button>
          )}
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
