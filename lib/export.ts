/**
 * Helpers de exportação para planilha.
 *
 * Gera CSV no padrão BR (separador `;`, UTF-8 com BOM pra Excel abrir certo
 * com acentuação) e dispara download no browser. Se quiser .xlsx no futuro,
 * basta trocar a implementação aqui — a API pública (`downloadSpreadsheet`)
 * permanece igual e todos os callers continuam funcionando.
 */

export type Cell = string | number | null | undefined | Date;

function escapeCsvCell(value: Cell): string {
  if (value == null) return "";
  let s: string;
  if (value instanceof Date) {
    // Formato DD/MM/YYYY (Excel BR reconhece como data)
    const d = String(value.getDate()).padStart(2, "0");
    const m = String(value.getMonth() + 1).padStart(2, "0");
    s = `${d}/${m}/${value.getFullYear()}`;
  } else if (typeof value === "number") {
    // BR usa vírgula decimal
    s = value.toString().replace(".", ",");
  } else {
    s = String(value);
  }

  // Aspas duplas se conter separador, quebra de linha ou aspas
  if (/[;"\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Gera e dispara download de um arquivo de planilha.
 *
 * @param filename — nome sem extensão (será adicionado ".csv")
 * @param headers — array de cabeçalhos das colunas
 * @param rows    — array de arrays, onde cada interno é uma linha (mesma ordem dos headers)
 *
 * Exemplo:
 *   downloadSpreadsheet("lancamentos-2026-04", ["Data", "Descrição", "Valor"], [
 *     [new Date(), "Salário", 5000],
 *     [new Date(), "Conta de luz", -250],
 *   ]);
 */
export function downloadSpreadsheet(filename: string, headers: string[], rows: Cell[][]): void {
  const lines = [headers.map(escapeCsvCell).join(";")];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(";"));
  }
  // BOM (﻿) garante que o Excel detecte UTF-8 e renderize acentos corretamente
  const csv = "﻿" + lines.join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
