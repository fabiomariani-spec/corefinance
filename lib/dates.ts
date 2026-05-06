/**
 * Helpers para parsing de datas vindas de API/forms no contexto BR (UTC-3).
 *
 * Problema: `new Date("2025-04-16")` é interpretado como UTC midnight,
 * que no horário do Brasil vira 2025-04-15 21:00 — o lançamento criado em
 * 16/04 aparece como 15/04 pra usuários no BR.
 *
 * Solução: forçar horário do meio-dia local. Funciona em qualquer timezone
 * porque às 12:00 ainda é o mesmo dia em qualquer fuso (-12 a +14).
 */

/**
 * Converte string de data (YYYY-MM-DD ou ISO) em Date no meio-dia BR.
 * Retorna `null` se a entrada for falsy.
 *
 * Aceita: "2025-04-16", "2025-04-16T00:00:00", "2025-04-16T00:00:00.000Z"
 */
export function parseBRDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  return new Date(String(input).slice(0, 10) + "T12:00:00");
}

/**
 * Versão non-null: usa `new Date()` se input vazio.
 */
export function parseBRDateOrNow(input: string | null | undefined): Date {
  return parseBRDate(input) ?? new Date();
}

/**
 * Regra de dia útil: se a data cair em sábado ou domingo, antecipa para a
 * sexta-feira imediatamente anterior. Segunda a sexta ficam inalteradas.
 *
 * Exemplos:
 *   sáb 16/04 → sex 15/04
 *   dom 17/04 → sex 15/04
 *   seg 18/04 → seg 18/04 (sem mudança)
 *
 * Uso: aplicar em geração de recorrências, folha de pagamento, e qualquer
 * data de vencimento projetada pelo sistema (Alessandra, financeiro).
 */
export function adjustToPreviousBusinessDay(date: Date): Date {
  const day = date.getDay(); // 0=domingo, 6=sábado
  if (day === 0) {
    // domingo → recua 2 dias (sexta)
    const out = new Date(date);
    out.setDate(date.getDate() - 2);
    return out;
  }
  if (day === 6) {
    // sábado → recua 1 dia (sexta)
    const out = new Date(date);
    out.setDate(date.getDate() - 1);
    return out;
  }
  return date;
}

/**
 * Retorna `true` se o dia for sábado ou domingo.
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Date → "YYYY-MM-DD" usando os componentes locais (não UTC).
 *
 * Por que não `d.toISOString().slice(0, 10)`?
 *   `toISOString()` converte para UTC. No Brasil (UTC-3), uma Date construída
 *   como `new Date(2025, 3, 16)` (16/04 local) é meia-noite local; em UTC isso
 *   é 16/04 03:00 → ainda 16/04. Mas para datas perto da meia-noite, ou em
 *   timezones com offset positivo (Tóquio), o slice ISO pode antecipar o dia.
 *   Usar componentes locais sempre devolve o dia que o usuário "vê".
 *
 * Exemplos:
 *   toDateStr(new Date(2025, 3, 16)) → "2025-04-16"
 *   toDateStr(new Date(2025, 11, 31)) → "2025-12-31"
 */
export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
