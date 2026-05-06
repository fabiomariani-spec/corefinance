"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Loader2, ArrowUpCircle, ArrowDownCircle, RefreshCw, ChevronDown, Check, AlertCircle, FileClock, X } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";
import { SmartDateInput } from "@/components/ui/smart-date-input";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { cachedFetch } from "@/lib/cached-fetch";

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

// Map field name → which section it belongs to (for error → open section)
const FIELD_SECTION: Record<string, "data" | "classification" | "payment"> = {
  description: "data",
  amount: "data",
  competenceDate: "classification",
};

export function TransactionModal({ open, onOpenChange, transaction, onSuccess }: Props) {
  const isEditing = Boolean(transaction?.id);
  const [form, setForm] = useState(EMPTY_FORM);
  const [recurringMonths, setRecurringMonths] = useState("12");
  const [openEnded, setOpenEnded] = useState(false);
  const [dueDayOfMonth, setDueDayOfMonth] = useState("5");
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Section open/closed state
  const [openSections, setOpenSections] = useState({
    data: true,
    classification: true,
    payment: false,
  });

  // Refs for focus on validation
  const descriptionRef = useRef<HTMLInputElement>(null);
  const competenceRef = useRef<HTMLInputElement>(null);

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
    setOpenSections({ data: true, classification: true, payment: false });
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
      setRecurringMonths("12"); setDueDayOfMonth("5");
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

  function sectionHasError(section: "data" | "classification" | "payment"): boolean {
    return Object.keys(errors).some((field) => FIELD_SECTION[field] === section);
  }

  function toggleSection(key: "data" | "classification" | "payment") {
    setOpenSections((s) => ({ ...s, [key]: !s[key] }));
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
    if (!res.ok) return; // keep modal open + draft intact on failure
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
    onSuccess();
  }

  async function handleSubmit() {
    const newErrors = validate();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      // Open every section that contains an error + focus first invalid
      const sectionsToOpen = { ...openSections };
      const errFields = Object.keys(newErrors);
      errFields.forEach((f) => {
        const sec = FIELD_SECTION[f];
        if (sec) sectionsToOpen[sec] = true;
      });
      setOpenSections(sectionsToOpen);
      // Focus first invalid input shortly after sections expand
      setTimeout(() => {
        if (newErrors.description) descriptionRef.current?.focus();
        else if (newErrors.competenceDate) competenceRef.current?.focus();
      }, 50);
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

  // ── Section header component ───────────────────────────────────────────
  function SectionHeader({
    sectionKey, title, subtitle, required,
  }: {
    sectionKey: "data" | "classification" | "payment";
    title: string; subtitle: string; required?: boolean;
  }) {
    const isOpen = openSections[sectionKey];
    const hasError = sectionHasError(sectionKey);
    return (
      <button
        type="button"
        onClick={() => toggleSection(sectionKey)}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-t-lg transition-colors ${
          hasError
            ? "bg-red-950/40 border-b border-red-600/40 hover:bg-red-950/60"
            : isOpen
              ? "bg-zinc-800/60 border-b border-zinc-700 hover:bg-zinc-800"
              : "bg-zinc-800/30 hover:bg-zinc-800/60"
        }`}
      >
        <div className="flex items-center gap-2.5 text-left">
          {hasError && <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
          <div>
            <p className={`text-sm font-medium leading-none ${hasError ? "text-red-300" : "text-zinc-100"}`}>
              {title} {required && <span className="text-indigo-400">*</span>}
            </p>
            <p className={`text-xs leading-none mt-1 ${hasError ? "text-red-400/80" : "text-zinc-500"}`}>
              {subtitle}
            </p>
          </div>
        </div>
        <ChevronDown
          className={`w-4 h-4 transition-transform ${hasError ? "text-red-400" : "text-zinc-400"} ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
    );
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

        <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-3">
          {/* ── Draft restore banner (NEW modal only) ── */}
          {!isEditing && pendingDraft && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-indigo-600/40 bg-indigo-600/10 px-3 py-2">
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
                  className="text-xs font-medium text-indigo-300 hover:text-indigo-200 px-2 py-1 rounded hover:bg-indigo-600/20 transition-colors"
                >
                  Restaurar
                </button>
                <button
                  type="button"
                  onClick={discardDraft}
                  aria-label="Descartar rascunho"
                  className="text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ── Seção 1: Dados ── */}
          <div className={`rounded-lg border ${sectionHasError("data") ? "border-red-600/50" : "border-zinc-700"} overflow-hidden`}>
            <SectionHeader
              sectionKey="data"
              title="Dados"
              subtitle="Tipo, descrição, valor e status"
              required
            />
            {openSections.data && (
              <div className="p-4 space-y-4">
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
          </div>

          {/* ── Seção 2: Classificação ── */}
          <div className={`rounded-lg border ${sectionHasError("classification") ? "border-red-600/50" : "border-zinc-700"} overflow-hidden`}>
            <SectionHeader
              sectionKey="classification"
              title="Classificação"
              subtitle="Categoria, departamento, colaborador, datas e recorrência"
            />
            {openSections.classification && (
              <div className="p-4 space-y-4">
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

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      Competência *
                      <InfoTooltip size="sm" text="Mês em que o lançamento foi gerado/contratado (não confundir com vencimento). Ex: salário de janeiro tem competência jan, mesmo que o pagamento caia em fevereiro." />
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
                      <InfoTooltip size="sm" text="Data limite pra pagar (ou receber) o valor. Após essa data o lançamento entra em atraso." />
                    </Label>
                    <SmartDateInput
                      value={form.dueDate}
                      onChange={(iso) => setForm({ ...form, dueDate: iso })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      Pagamento
                      <InfoTooltip size="sm" text="Data efetiva em que o dinheiro entrou ou saiu da conta. Preenchido só depois que o pagamento foi feito de fato." />
                    </Label>
                    <SmartDateInput
                      value={form.paymentDate}
                      onChange={(iso) => setForm({ ...form, paymentDate: iso })}
                    />
                  </div>
                </div>

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
                          <Label className="text-xs">Dia do vencimento (1–31)</Label>
                          <Input type="number" min="1" max="31" placeholder="5" value={dueDayOfMonth}
                            onChange={(e) => setDueDayOfMonth(e.target.value)} className="text-center" />
                          <p className="text-xs text-zinc-600">
                            Em meses sem o dia escolhido (ex: 31 em fevereiro), cai no último dia do mês.
                            Se cair em sáb/dom, antecipa pra sexta.
                          </p>
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
          </div>

          {/* ── Seção 3: Pagamento ── */}
          <div className={`rounded-lg border ${sectionHasError("payment") ? "border-red-600/50" : "border-zinc-700"} overflow-hidden`}>
            <SectionHeader
              sectionKey="payment"
              title="Pagamento"
              subtitle="Conta, cartão, forma de pagamento e observações (opcional)"
            />
            {openSections.payment && (
              <div className="p-4 space-y-4">
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

                <div className="space-y-1.5">
                  <Label>Observações</Label>
                  <Textarea placeholder="Informações adicionais..." value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
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
          <Button type="button" onClick={handleSubmit} disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white border-0">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
              : isEditing ? "Salvar"
              : form.isRecurring ? `Criar ${recurringMonths} Lançamentos`
              : "Criar Lançamento"}
          </Button>
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
