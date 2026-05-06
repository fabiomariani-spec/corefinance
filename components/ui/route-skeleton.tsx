import * as React from "react";

/**
 * RouteSkeleton — skeleton compartilhado pra `loading.tsx` de rotas dashboard.
 *
 * DRY: substitui ~25–30 linhas duplicadas por loading file. Cada rota declara
 * só o variant + props (kpis, filters, rows, cards, withSubtitle).
 *
 * Estilo: usa a classe global `.skeleton` (shimmer zinc) definida em
 * `app/globals.css`. Tema dark zinc/indigo.
 */
export type SkeletonVariant = "table" | "grid" | "dashboard" | "form" | "split";

export interface RouteSkeletonProps {
  /** Forma do conteúdo principal abaixo do header. */
  variant: SkeletonVariant;
  /** Número de KPI cards no topo (default 4, 0 pra esconder). */
  kpis?: number;
  /** Filter chips entre KPIs e conteúdo (default 0). */
  filters?: number;
  /** Linhas da tabela (variant="table"). Default 10. */
  rows?: number;
  /** Cards do grid (variant="grid"). Default 6. */
  cards?: number;
  /** Mostra sub-heading (linha menor) abaixo do título. Default false. */
  withSubtitle?: boolean;
}

function HeaderBlock({ withSubtitle }: { withSubtitle: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <div className="h-8 w-48 skeleton rounded" />
        {withSubtitle && <div className="h-4 w-72 skeleton rounded" />}
      </div>
      <div className="h-10 w-36 skeleton rounded-lg" />
    </div>
  );
}

function KpisBlock({ count }: { count: number }) {
  if (count <= 0) return null;
  // Grid responsivo: até 4 colunas em lg, mais densas em xl pra dashboard.
  const cols =
    count >= 6
      ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-6"
      : count === 5
      ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-5"
      : "grid-cols-2 md:grid-cols-4";
  return (
    <div className={`grid ${cols} gap-3`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-24 skeleton rounded-xl" />
      ))}
    </div>
  );
}

function FiltersBlock({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-9 w-32 skeleton rounded-lg" />
      ))}
    </div>
  );
}

function TableBlock({ rows }: { rows: number }) {
  return (
    <div className="rounded-xl overflow-hidden border border-zinc-800">
      <div className="h-12 skeleton" />
      <div className="divide-y divide-zinc-800">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-14 skeleton" style={{ opacity: 0.7 }} />
        ))}
      </div>
    </div>
  );
}

function GridBlock({ cards }: { cards: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="h-44 skeleton rounded-xl" />
      ))}
    </div>
  );
}

function DashboardBlock() {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-96 skeleton rounded-xl" />
        <div className="h-96 skeleton rounded-xl" />
      </div>
      <div className="h-64 skeleton rounded-xl" />
    </>
  );
}

function FormBlock() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-zinc-800 p-4 space-y-3"
        >
          <div className="h-5 w-48 skeleton rounded" />
          <div className="h-10 w-full skeleton rounded-lg" />
        </div>
      ))}
    </div>
  );
}

function SplitBlock() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="space-y-3">
        <div className="h-6 w-32 skeleton rounded" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 skeleton rounded-lg" />
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-6 w-32 skeleton rounded" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 skeleton rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export function RouteSkeleton({
  variant,
  kpis = 4,
  filters = 0,
  rows = 10,
  cards = 6,
  withSubtitle = false,
}: RouteSkeletonProps) {
  return (
    <div className="p-6 space-y-4">
      <HeaderBlock withSubtitle={withSubtitle} />
      <KpisBlock count={kpis} />
      <FiltersBlock count={filters} />
      {variant === "table" && <TableBlock rows={rows} />}
      {variant === "grid" && <GridBlock cards={cards} />}
      {variant === "dashboard" && <DashboardBlock />}
      {variant === "form" && <FormBlock />}
      {variant === "split" && <SplitBlock />}
    </div>
  );
}
