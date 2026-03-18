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
  AlertTriangle,
  Pencil,
  Check,
  X,
  Wallet,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { CurrencyInput } from "@/components/ui/currency-input";

interface Category {
  id: string;
  name: string;
  type: string;
  color: string;
  children?: Category[];
}

interface Department {
  id: string;
  name: string;
  code: string | null;
  color: string;
  monthlyBudget: number;
}

const COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#3b82f6", "#ec4899", "#14b8a6", "#f97316", "#84cc16",
  "#6b7280", "#a855f7",
];

export default function CategoriasPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "category" | "department";
    id: string;
    name: string;
    hasChildren?: boolean;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Inline budget edit state
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [budgetValue, setBudgetValue] = useState(0);

  // Inline name edit state (categories)
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [nameValue, setNameValue] = useState("");

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
      fetch("/api/categories").then((r) => r.json()),
      fetch("/api/departments").then((r) => r.json()),
    ]);
    setCategories(cats);
    setDepartments(depts.map((d: Department & { monthlyBudget: string | number }) => ({
      ...d,
      monthlyBudget: Number(d.monthlyBudget ?? 0),
    })));
    setLoading(false);
  }

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

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const endpoint =
      deleteTarget.type === "category"
        ? `/api/categories/${deleteTarget.id}`
        : `/api/departments/${deleteTarget.id}`;
    await fetch(endpoint, { method: "DELETE" });
    setDeleting(false);
    setDeleteTarget(null);
    fetchData();
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

  const incomeCategories = categories.filter((c) => c.type === "INCOME");
  const expenseCategories = categories.filter((c) => c.type === "EXPENSE");

  function CategoryList({ cats }: { cats: Category[] }) {
    return (
      <div className="space-y-1">
        {cats.map((cat) => (
          <div key={cat.id}>
            {/* Parent category row */}
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-zinc-800/50 group">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
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
                  <button
                    onClick={() => { setEditingNameId(cat.id); setNameValue(cat.name); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300"
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
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400"
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
                  <div key={child.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-800/50 group">
                    <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: child.color }} />
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
                        <button
                          onClick={() => { setEditingNameId(child.id); setNameValue(child.name); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300"
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
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400"
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
                  <h3 className="text-sm font-semibold text-emerald-400 mb-4 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    Receitas ({incomeCategories.length})
                  </h3>
                  {incomeCategories.length > 0 ? (
                    <CategoryList cats={incomeCategories} />
                  ) : (
                    <p className="text-sm text-zinc-600 text-center py-6">Nenhuma categoria de receita</p>
                  )}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-red-400 mb-4 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-400" />
                    Despesas ({expenseCategories.length})
                  </h3>
                  {expenseCategories.length > 0 ? (
                    <CategoryList cats={expenseCategories} />
                  ) : (
                    <p className="text-sm text-zinc-600 text-center py-6">Nenhuma categoria de despesa</p>
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
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400 shrink-0"
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
                    <p className="col-span-full text-sm text-zinc-600 text-center py-8">Nenhum departamento cadastrado</p>
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
              <div className="flex flex-wrap gap-2">
                {COLORS.map((color) => (
                  <button key={color} type="button" className={`w-6 h-6 rounded-full transition-transform ${catForm.color === color ? "scale-125 ring-2 ring-white ring-offset-2 ring-offset-zinc-900" : ""}`} style={{ backgroundColor: color }} onClick={() => setCatForm({ ...catForm, color })} />
                ))}
              </div>
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
              <div className="flex flex-wrap gap-2">
                {COLORS.map((color) => (
                  <button key={color} type="button" className={`w-6 h-6 rounded-full transition-transform ${deptForm.color === color ? "scale-125 ring-2 ring-white ring-offset-2 ring-offset-zinc-900" : ""}`} style={{ backgroundColor: color }} onClick={() => setDeptForm({ ...deptForm, color })} />
                ))}
              </div>
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
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Confirmar exclusão
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-sm text-zinc-300">
              Tem certeza que deseja excluir{" "}
              <span className="font-semibold text-white">
                &ldquo;{deleteTarget?.name}&rdquo;
              </span>
              ?
            </p>
            {deleteTarget?.hasChildren && (
              <p className="text-xs text-amber-400 flex items-center gap-1.5 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Esta categoria possui subcategorias que também serão excluídas.
              </p>
            )}
            <p className="text-xs text-zinc-500">
              Os lançamentos vinculados não serão afetados.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleConfirmDelete}
              disabled={deleting}
            >
              {deleting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Excluindo...</>
              ) : (
                <><Trash2 className="w-4 h-4" /> Excluir</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
