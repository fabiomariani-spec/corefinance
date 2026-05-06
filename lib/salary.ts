/**
 * Lógica compartilhada de folha de pagamento (salário dos colaboradores).
 *
 * Antes: a função `generateSalaryTransactions` estava duplicada em 3 rotas
 * diferentes (employees, employees/[id], employees/[id]/status), violando DRY.
 * Consolidei aqui pra ter uma única fonte de verdade.
 *
 * Mudanças de regra:
 *  - Vencimento que cair em sábado/domingo é antecipado pra sexta-feira
 *    anterior (regra do financeiro — nada pode vencer em fim de semana).
 *  - Ao regenerar salário (edição), DELETA os lançamentos futuros PENDING
 *    em vez de marcá-los como CANCELLED. Antes, cada edição deixava 12
 *    registros "cancelados" como lixo no DB.
 */
import { prisma } from "@/lib/prisma";
import { adjustToPreviousBusinessDay } from "@/lib/dates";
import { addMonths, startOfMonth } from "date-fns";

type EmployeeForPayroll = {
  id: string;
  name: string;
  salary: unknown;
  dueDayOfMonth: number;
  departmentId: string | null;
};

/**
 * Gera N lançamentos mensais de salário a partir do mês corrente.
 * Aplica regra de dia útil (sáb/dom → sex anterior).
 */
export async function generateSalaryTransactions(
  employee: EmployeeForPayroll,
  companyId: string,
  categoryId: string,
  months = 12
): Promise<void> {
  const today = new Date();
  const salary = Number(employee.salary);
  const day = Math.min(employee.dueDayOfMonth, 28);

  const transactions = Array.from({ length: months }, (_, i) => {
    const competence = startOfMonth(addMonths(today, i));
    const rawDue = new Date(competence.getFullYear(), competence.getMonth(), day);
    const due = adjustToPreviousBusinessDay(rawDue);
    return {
      companyId,
      employeeId: employee.id,
      description: `Salário — ${employee.name}`,
      amount: salary,
      type: "EXPENSE" as const,
      status: "PENDING" as const,
      competenceDate: competence,
      dueDate: due,
      categoryId,
      departmentId: employee.departmentId ?? null,
      isRecurring: true,
      recurrenceGroupId: `salary-${employee.id}`,
    };
  });

  await prisma.transaction.createMany({ data: transactions });
}

/**
 * Remove lançamentos futuros PENDING de salário de um colaborador.
 * Usado antes de regenerar em **edição** do colaborador (correção de valor
 * ou dia de pagamento).
 *
 * Importante: DELETE (não CANCEL). Lançamentos futuros PENDING nunca foram
 * realizados — não precisam ficar no histórico. Isto corrige o bug onde
 * cada edição deixava 12 "cancelados" como lixo no DB.
 */
export async function deleteFuturePendingSalary(employeeId: string): Promise<void> {
  await prisma.transaction.deleteMany({
    where: {
      employeeId,
      status: "PENDING",
      dueDate: { gte: new Date() },
    },
  });
}

/**
 * Marca lançamentos futuros PENDING como CANCELLED.
 * Usado quando o colaborador é **pausado ou desligado** — aí faz sentido
 * preservar o histórico "havia previsão, foi cancelada".
 */
export async function cancelFutureSalary(employeeId: string): Promise<void> {
  await prisma.transaction.updateMany({
    where: {
      employeeId,
      status: "PENDING",
      dueDate: { gte: new Date() },
    },
    data: { status: "CANCELLED" },
  });
}
