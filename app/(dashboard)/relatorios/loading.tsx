/**
 * Loading da rota Relatórios.
 *
 * Aproxima a estrutura real pra reduzir CLS: um card de "Configurar Relatório"
 * (título + chips de tipo + chips de preset + accordion de período) e, abaixo,
 * a área onde o relatório/empty-state aparece.
 */
export default function Loading() {
  return (
    <div className="flex-1 p-6 space-y-5">
      {/* Painel de filtros */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="h-5 w-44 skeleton rounded" />

        {/* Tipo de relatório — chips */}
        <div className="space-y-1.5">
          <div className="h-3.5 w-28 skeleton rounded" />
          <div className="flex gap-1.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 w-32 skeleton rounded-md" />
            ))}
          </div>
        </div>

        {/* Período — presets */}
        <div className="space-y-1.5">
          <div className="h-3.5 w-16 skeleton rounded" />
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 w-24 skeleton rounded-md" />
            ))}
          </div>
        </div>

        {/* Accordion período personalizado (fechado) */}
        <div className="border-t border-zinc-800 pt-3">
          <div className="h-4 w-44 skeleton rounded" />
        </div>
      </div>

      {/* Área do relatório / empty state */}
      <div className="h-80 skeleton rounded-xl" />
    </div>
  );
}
