/**
 * Loading da rota Fluxo de Caixa.
 *
 * Aproxima a estrutura real pra reduzir CLS: filtro no topo, 5 KPIs de
 * liquidez, gráfico de projeção (~220px), resumo do mês em 3 colunas, gráfico
 * de barras diário (~200px) e blocos de listas (A Receber / A Pagar / Extrato).
 */
export default function Loading() {
  return (
    <div className="flex-1 p-6 space-y-5">
      {/* Filtro por intervalo */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-64 skeleton rounded-md" />
        <div className="h-7 w-40 skeleton rounded-md" />
      </div>

      {/* 1. Painel de Liquidez — 5 KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="col-span-2 lg:col-span-1 h-28 skeleton rounded-xl" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 skeleton rounded-xl" />
        ))}
      </div>

      {/* 3. Projeção de Caixa */}
      <div className="h-72 skeleton rounded-xl" />

      {/* 4. Resumo do Mês — 3 colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-40 skeleton rounded-xl" />
        ))}
      </div>

      {/* 5. Entradas e Saídas por Dia */}
      <div className="h-64 skeleton rounded-xl" />

      {/* 6/7/8. Listas e extrato */}
      <div className="h-48 skeleton rounded-xl" />
      <div className="h-48 skeleton rounded-xl" />
      <div className="h-64 skeleton rounded-xl" />
    </div>
  );
}
