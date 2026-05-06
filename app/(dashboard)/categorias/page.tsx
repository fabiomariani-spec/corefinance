"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ColorPicker } from "@/components/ui/color-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Plus,
  Tag,
  Building2,
  ChevronRight,
  Loader2,
  Trash2,
  Pencil,
  Check,
  X,
  Wallet,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { CurrencyInput } from "@/components/ui/currency-input";
import { toast } from "@/lib/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { useClickOutside } from "@/lib/use-click-outside";

interface Category {
  id: string;
  name: string;
  type: string;
  color: string;
  isActive?: boolean;
  children?: Category[];
}

const DEFAULT_INCOME_COLOR = "#10b981";
const DEFAULT_EXPENSE_COLOR = "#ef4444";

function ColorDotButton({ color, size, onPick }: { color: string; size: "sm" | "xs"; onPick: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));

  const dotClass = size === "sm" ? "w-3 h-3" : "w-2 h-2";
  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${dotClass} rounded-full hover:ring-2 hover:ring-indigo-400/40 transition`}
        style={{ backgroundColor: color }}
        title="Alterar cor"
      />
      {open && (
        <div className="absolute z-50 left-0 top-5 bg-zinc-900 border border-zinc-700 rounded-lg p-2 shadow-xl">
          <ColorPicker
            value={color}
            onChange={(c) => { onPick(c); setOpen(false); }}
            size="sm"
          />
        </div>
      )}
    </div>
  );
}

function Switch({ checked, onChange, title }: { checked: boolean; onChange: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onChange}
      title={title}
      className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors shrink-0 ${
        checked ? "bg-indigo-500" : "bg-zinc-700"
      }`}
    >
      <span
        className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-3.5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

interface Department {
  id: string;
  name: string;
  code: string | null;
  color: string;
  monthlyBudget: number;
}

type DeleteTarget = {
  type: "category" | "department";
  id: string;
  name: string;
  hasChildren?: boolean;
};

interface CategoryListProps {
  cats: Category[];
  editingNameId: string | null;
  nameValue: string;
  setEditingNameId: (id: string | null) => void;
  setNameValue: (v: string) => void;
  handleSaveName: (id: string) => void;
  setDeleteTarget: (target: DeleteTarget | null) => void;
  handleToggleActive: (id: string, current: boolean) => void;
  handleChangeColor: (id: string, color: string) => void;
}

function CategoryList({
  cats,
  editingNameId,
  nameValue,
  setEditingNameId,
  setNameValue,
  handleSaveName,
  setDeleteTarget,
  handleToggleActive,
  handleChangeColor,
}: CategoryListProps) {
  return (
    <div className="space-y-1">
      {cats.map((cat) => (
        <div key={cat.id}>
          {/* Parent category row */}
          <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-zinc-800/50 group ${cat.isActive === false ? "opacity-60" : ""}`}>
            <ColorDotButton color={cat.color} size="sm" onPick={(c) => handleChangeColor(cat.id, c)} />
            {editingNameId === cat.id ? (
              <>
                <input
                  autoFocus
                  className="flex-1 text-sm bg-transparent border-b border-indigo-500 text-zinc-100 focus:outline-none px-0.5"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveName(cat.id);
                    if (e.key === "Escape") setEditingNameId(null);
                  }}
                />
                <button
                  onClick={() => handleSaveName(cat.id)}
                  className="text-emerald-400 hover:text-emerald-300 p-0.5"
                  title="Salvar"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setEditingNameId(null)}
                  className="text-zinc-500 hover:text-zinc-300 p-0.5"
                  title="Cancelar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <>
                <span className="text-sm text-zinc-200 flex-1">{cat.name}</span>
                {cat.isActive === false && (
                  <span className="text-[10px] uppercase tracking-wide text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">Inativa</span>
                )}
                <Switch
                  checked={cat.isActive !== false}
                  onChange={() => handleToggleActive(cat.id, cat.isActive !== false)}
                  title={cat.isActive === false ? "Ativar" : "Desativar"}
                />
                <button
                  onClick={() => { setEditingNameId(cat.id); setNameValue(cat.name); }}
                  className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300"
                  title="Renomear categoria"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() =>
                    setDeleteTarget({
                      type: "category",
                      id: cat.id,
                      name: cat.name,
                      hasChildren: (cat.children?.length ?? 0) > 0,
                    })
                  }
                  className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400"
                  title="Excluir categoria"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>

          {/* Subcategory rows */}
          {cat.children && cat.children.length > 0 && (
            <div className="ml-5 border-l border-zinc-800 pl-3 space-y-0.5 mt-0.5 mb-1">
              {cat.children.map((child) => (
                <div key={child.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-800/50 group ${child.isActive === false ? "opacity-60" : ""}`}>
                  <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />
                  <ColorDotButton color={child.color} size="xs" onPick={(c) => handleChangeColor(child.id, c)} />
                  {editingNameId === child.id ? (
                    <>
                      <input
                        autoFocus
                        className="flex-1 text-xs bg-transparent border-b border-indigo-500 text-zinc-100 focus:outline-none px-0.5"
                        value={nameValue}
                        onChange={(e) => setNameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveName(child.id);
                          if (e.key === "Escape") setEditingNameId(null);
                        }}
                      />
                      <button
                        onClick={() => handleSaveName(child.id)}
                        className="text-emerald-400 hover:text-emerald-300 p-0.5"
                        title="Salvar"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setEditingNameId(null)}
                        className="text-zinc-500 hover:text-zinc-300 p-0.5"
                        title="Cancelar"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-zinc-400 flex-1">{child.name}</span>
                      {child.isActive === false && (
                        <span className="text-[10px] uppercase tracking-wide text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">Inativa</span>
                      )}
                      <Switch
                        checked={child.isActive !== false}
                        onChange={() => handleToggleActive(child.id, child.isActive !== false)}
                        title={child.isActive === false ? "Ativar" : "Desativar"}
                      />
                      <button
                        onClick={() => { setEditingNameId(child.id); setNameValue(child.name); }}
                        className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300"
                        title="Renomear subcategoria"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() =>
                          setDeleteTarget({
                            type: "category",
                            id: child.id,
                            name: child.name,
                            hasChildren: false,
                          })
                        }
                        className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400"
                        title="Excluir subcategoria"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function CategoriasPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Inline budget edit state
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [budgetValue, setBudgetValue] = useState(0);

  // Inline name edit state (categories)
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [nameValue, setNameValue] = useState("");

  // Inline-create state per column
  const [inlineCreateType, setInlineCreateType] = useState<"INCOME" | "EXPENSE" | null>(null);
  const [inlineCreateName, setInlineCreateName] = useState("");
  const [inlineCreating, setInlineCreating] = useState(false);

  const [catForm, setCatForm] = useState({
    name: "",
    type: "EXPENSE",
    parentId: "",
    color: "#ef4444",
  });

  const [deptForm, setDeptForm] = useState({
    name: "",
    code: "",
    color: "#10b981",
  });

  async function fetchData() {
    setLoading(true);
    const [cats, depts] = await Promise.all([
      fetch("/api/categories?includeInactive=1").then((r) => r.json()),
      fetch("/api/departments").then((r) => r.json()),
    ]);
    setCategories(cats);
    setDepartments(depts.map((d: Department & { monthlyBudget: string | number }) => ({
      ...d,
      monthlyBudget: Number(d.monthlyBudget ?? 0),
    })));
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
  useEffect(() => { fetchData(); }, []);

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: catForm.name,
        type: catForm.type,
        parentId: catForm.parentId || null,
        color: catForm.color,
      }),
    });
    setSaving(false);
    setCatModalOpen(false);
    setCatForm({ name: "", type: "EXPENSE", parentId: "", color: "#ef4444" });
    fetchData();
  }

  async function handleCreateDepartment(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: deptForm.name,
        code: deptForm.code || null,
        color: deptForm.color,
      }),
    });
    setSaving(false);
    setDeptModalOpen(false);
    setDeptForm({ name: "", code: "", color: "#10b981" });
    fetchData();
  }

  // Captura snapshot do item antes de deletar — usado pelo undo pra recriar
  // com a mesma cor/tipo. Sem isso, o undo recriaria com defaults e perderia
  // a cor original que o usuário escolheu.
  function findCategorySnapshot(id: string): Category | null {
    const walk = (list: Category[]): Category | null => {
      for (const c of list) {
        if (c.id === id) return c;
        if (c.children?.length) {
          const r = walk(c.children);
          if (r) return r;
        }
      }
      return null;
    };
    return walk(categories);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const target = deleteTarget;
    const endpoint =
      target.type === "category"
        ? `/api/categories/${target.id}`
        : `/api/departments/${target.id}`;

    // Snapshot pra possível undo
    const catSnap = target.type === "category" ? findCategorySnapshot(target.id) : null;
    const deptSnap = target.type === "department" ? departments.find((d) => d.id === target.id) ?? null : null;

    await fetch(endpoint, { method: "DELETE" });
    setDeleting(false);
    setDeleteTarget(null);
    fetchData();

    const label = target.type === "category" ? "Categoria" : "Departamento";
    toast.success(`${label} excluído.`, {
      undo: async () => {
        if (target.type === "category" && catSnap) {
          await fetch("/api/categories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: catSnap.name,
              type: catSnap.type,
              parentId: null, // children/parent são reconstruídos manualmente se necessário
              color: catSnap.color,
            }),
          });
        } else if (target.type === "department" && deptSnap) {
          await fetch("/api/departments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: deptSnap.name,
              code: deptSnap.code || null,
              color: deptSnap.color,
            }),
          });
        }
        fetchData();
      },
    });
  }

  async function handleSaveBudget(deptId: string) {
    await fetch(`/api/departments/${deptId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monthlyBudget: budgetValue }),
    });
    setEditingBudgetId(null);
    fetchData();
  }

  async function handleSaveName(catId: string) {
    if (!nameValue.trim()) return;
    await fetch(`/api/categories/${catId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameValue.trim() }),
    });
    setEditingNameId(null);
    fetchData();
  }

  function updateCategoryInTree(list: Category[], id: string, patch: Partial<Category>): Category[] {
    return list.map((c) => {
      if (c.id === id) return { ...c, ...patch };
      if (c.children?.length) {
        return { ...c, children: updateCategoryInTree(c.children, id, patch) };
      }
      return c;
    });
  }

  async function handleToggleActive(id: string, current: boolean) {
    const next = !current;
    setCategories((prev) => updateCategoryInTree(prev, id, { isActive: next }));
    const res = await fetch(`/api/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: next }),
    });
    if (!res.ok) {
      // revert on failure
      setCategories((prev) => updateCategoryInTree(prev, id, { isActive: current }));
    }
  }

  async function handleChangeColor(id: string, color: string) {
    let prevColor = "";
    setCategories((prev) => {
      const find = (list: Category[]): string => {
        for (const c of list) {
          if (c.id === id) return c.color;
          if (c.children?.length) {
            const r = find(c.children);
            if (r) return r;
          }
        }
        return "";
      };
      prevColor = find(prev);
      return updateCategoryInTree(prev, id, { color });
    });
    const res = await fetch(`/api/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color }),
    });
    if (!res.ok && prevColor) {
      setCategories((prev) => updateCategoryInTree(prev, id, { color: prevColor }));
    }
  }

  async function handleInlineCreate(type: "INCOME" | "EXPENSE") {
    if (!inlineCreateName.trim()) return;
    setInlineCreating(true);
    const color = type === "INCOME" ? DEFAULT_INCOME_COLOR : DEFAULT_EXPENSE_COLOR;
    await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: inlineCreateName.trim(), type, parentId: null, color }),
    });
    setInlineCreating(false);
    setInlineCreateName("");
    setInlineCreateType(null);
    fetchData();
  }

  const incomeCategories = categories.filter((c) => c.type === "INCOME");
  const expenseCategories = categories.filter((c) => c.type === "EXPENSE");

  const listProps = {
    editingNameId,
    nameValue,
    setEditingNameId,
    setNameValue,
    handleSaveName,
    setDeleteTarget,
    handleToggleActive,
    handleChangeColor,
  };

  return (
    <>
      <Header title="Plano de Contas" subtitle="Categorias e departamentos" />
      <div className="flex-1 p-6 space-y-5">
        <Tabs defaultValue="categorias">
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="categorias">
                <Tag className="w-3.5 h-3.5 mr-1.5" /> Categorias
              </TabsTrigger>
              <TabsTrigger value="departamentos">
                <Building2 className="w-3.5 h-3.5 mr-1.5" /> Departamentos
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="categorias">
            <div className="flex justify-end mb-4">
              <Button onClick={() => setCatModalOpen(true)} size="sm">
                <Plus className="w-4 h-4" /> Nova Categoria
              </Button>
            </div>
            {loading ? (
              <div className="h-64 skeleton rounded-xl" />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      Receitas ({incomeCategories.length})
                    </h3>
                    <button
                      onClick={() => { setInlineCreateType("INCOME"); setInlineCreateName(""); }}
                      className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 transition-colors"
                      title="Adicionar receita"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  {inlineCreateType === "INCOME" && (
                    <div className="flex items-center gap-2 px-3 py-2.5 mb-1 rounded-lg bg-zinc-800/50 border border-indigo-500/40">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: DEFAULT_INCOME_COLOR }} />
                      <input
                        autoFocus
                        placeholder="Nome da categoria"
                        className="flex-1 text-sm bg-transparent border-b border-indigo-500 text-zinc-100 focus:outline-none px-0.5"
                        value={inlineCreateName}
                        onChange={(e) => setInlineCreateName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleInlineCreate("INCOME");
                          if (e.key === "Escape") { setInlineCreateType(null); setInlineCreateName(""); }
                        }}
                      />
                      <button
                        onClick={() => handleInlineCreate("INCOME")}
                        disabled={inlineCreating || !inlineCreateName.trim()}
                        className="text-emerald-400 hover:text-emerald-300 p-0.5 disabled:opacity-40"
                        title="Criar"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { setInlineCreateType(null); setInlineCreateName(""); }}
                        className="text-zinc-500 hover:text-zinc-300 p-0.5"
                        title="Cancelar"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  {incomeCategories.length > 0 ? (
                    <CategoryList cats={incomeCategories} {...listProps} />
                  ) : (
                    inlineCreateType !== "INCOME" && (
                      <EmptyState
                        size="sm"
                        icon={Tag}
                        title="Sem categorias de receita"
                        description="Crie categorias pra organizar suas entradas (vendas, serviços, juros)."
                        actionLabel={
                          <>
                            <Plus className="w-4 h-4" /> Nova receita
                          </>
                        }
                        onAction={() => { setInlineCreateType("INCOME"); setInlineCreateName(""); }}
                        actionVariant="outline"
                      />
                    )
                  )}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-400" />
                      Despesas ({expenseCategories.length})
                    </h3>
                    <button
                      onClick={() => { setInlineCreateType("EXPENSE"); setInlineCreateName(""); }}
                      className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-red-400 transition-colors"
                      title="Adicionar despesa"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  {inlineCreateType === "EXPENSE" && (
                    <div className="flex items-center gap-2 px-3 py-2.5 mb-1 rounded-lg bg-zinc-800/50 border border-indigo-500/40">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: DEFAULT_EXPENSE_COLOR }} />
                      <input
                        autoFocus
                        placeholder="Nome da categoria"
                        className="flex-1 text-sm bg-transparent border-b border-indigo-500 text-zinc-100 focus:outline-none px-0.5"
                        value={inlineCreateName}
                        onChange={(e) => setInlineCreateName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleInlineCreate("EXPENSE");
                          if (e.key === "Escape") { setInlineCreateType(null); setInlineCreateName(""); }
                        }}
                      />
                      <button
                        onClick={() => handleInlineCreate("EXPENSE")}
                        disabled={inlineCreating || !inlineCreateName.trim()}
                        className="text-emerald-400 hover:text-emerald-300 p-0.5 disabled:opacity-40"
                        title="Criar"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { setInlineCreateType(null); setInlineCreateName(""); }}
                        className="text-zinc-500 hover:text-zinc-300 p-0.5"
                        title="Cancelar"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  {expenseCategories.length > 0 ? (
                    <CategoryList cats={expenseCategories} {...listProps} />
                  ) : (
                    inlineCreateType !== "EXPENSE" && (
                      <EmptyState
                        size="sm"
                        icon={Tag}
                        title="Sem categorias de despesa"
                        description="Crie categorias pra classificar gastos (folha, marketing, software)."
                        actionLabel={
                          <>
                            <Plus className="w-4 h-4" /> Nova despesa
                          </>
                        }
                        onAction={() => { setInlineCreateType("EXPENSE"); setInlineCreateName(""); }}
                        actionVariant="outline"
                      />
                    )
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="departamentos">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5" />
                Clique em &ldquo;Budget mensal&rdquo; para definir o orçamento de cada área
              </p>
              <Button onClick={() => setDeptModalOpen(true)} size="sm">
                <Plus className="w-4 h-4" /> Novo Departamento
              </Button>
            </div>
            {loading ? (
              <div className="h-64 skeleton rounded-xl" />
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {departments.map((dept) => (
                    <div
                      key={dept.id}
                      className="relative flex flex-col gap-2 p-3 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors group"
                    >
                      {/* Header row */}
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                          style={{ backgroundColor: dept.color }}
                        >
                          {dept.code ? dept.code.slice(0, 3) : dept.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-200 truncate">{dept.name}</p>
                          {dept.code && <p className="text-xs text-zinc-500">{dept.code}</p>}
                        </div>
                        <button
                          onClick={() =>
                            setDeleteTarget({
                              type: "department",
                              id: dept.id,
                              name: dept.name,
                            })
                          }
                          className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400 shrink-0"
                          title="Excluir departamento"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Budget inline edit */}
                      <div className="pl-11">
                        {editingBudgetId === dept.id ? (
                          <div className="flex items-center gap-1">
                            <CurrencyInput
                              compact
                              autoFocus
                              value={budgetValue}
                              onChange={setBudgetValue}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveBudget(dept.id);
                                if (e.key === "Escape") setEditingBudgetId(null);
                              }}
                            />
                            <button
                              onClick={() => handleSaveBudget(dept.id)}
                              className="text-emerald-400 hover:text-emerald-300 p-0.5"
                              title="Salvar"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => setEditingBudgetId(null)}
                              className="text-zinc-500 hover:text-zinc-300 p-0.5"
                              title="Cancelar"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingBudgetId(dept.id);
                              setBudgetValue(dept.monthlyBudget ?? 0);
                            }}
                            className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors group/budget w-full"
                            title="Definir budget mensal"
                          >
                            <Pencil className="w-2.5 h-2.5 opacity-0 group-hover/budget:opacity-100 transition-opacity shrink-0" />
                            <span className={dept.monthlyBudget > 0 ? "text-zinc-400" : "text-zinc-600"}>
                              {dept.monthlyBudget > 0
                                ? `Budget: ${formatCurrency(dept.monthlyBudget)}/mês`
                                : "Budget mensal"}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {departments.length === 0 && (
                    <div className="col-span-full">
                      <EmptyState
                        size="md"
                        icon={Building2}
                        title="Sem departamentos"
                        description="Crie departamentos pra organizar a empresa em áreas com budget próprio (ex: Marketing, Operações)."
                        actionLabel={
                          <>
                            <Plus className="w-4 h-4" /> Novo Departamento
                          </>
                        }
                        onAction={() => setDeptModalOpen(true)}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Category Modal */}
      <Dialog open={catModalOpen} onOpenChange={setCatModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Nova Categoria</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateCategory} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input placeholder="Ex: Software e SaaS" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={catForm.type} onValueChange={(v) => setCatForm({ ...catForm, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INCOME">Receita</SelectItem>
                  <SelectItem value="EXPENSE">Despesa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Categoria Pai (opcional)</Label>
              <Select value={catForm.parentId} onValueChange={(v) => setCatForm({ ...catForm, parentId: v })}>
                <SelectTrigger><SelectValue placeholder="Raiz (sem pai)" /></SelectTrigger>
                <SelectContent>
                  {categories.filter((c) => c.type === catForm.type && !c.children?.length).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <ColorPicker value={catForm.color} onChange={(color) => setCatForm({ ...catForm, color })} size="sm" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCatModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando...</> : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Department Modal */}
      <Dialog open={deptModalOpen} onOpenChange={setDeptModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Novo Departamento</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateDepartment} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input placeholder="Ex: Marketing" value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>Código (sigla)</Label>
              <Input placeholder="Ex: MKT" value={deptForm.code} onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value.toUpperCase() })} maxLength={5} />
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <ColorPicker value={deptForm.color} onChange={(color) => setDeptForm({ ...deptForm, color })} size="sm" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDeptModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando...</> : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Confirmar exclusão"
        loading={deleting}
        message={
          <>
            <p>
              Tem certeza que deseja excluir{" "}
              <span className="font-semibold text-white">&ldquo;{deleteTarget?.name}&rdquo;</span>?
            </p>
            <p className="text-xs text-zinc-500 mt-2">
              Os lançamentos vinculados não serão afetados.
            </p>
          </>
        }
        warning={deleteTarget?.hasChildren ? "Esta categoria possui subcategorias que também serão excluídas." : undefined}
      />
    </>
  );
}
