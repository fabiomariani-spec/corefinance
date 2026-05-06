-- Índices para acelerar /api/transactions
-- Cole no Supabase Dashboard → SQL Editor → Run
-- (sem CONCURRENTLY pq o SQL Editor roda em transaction; tabela pequena, lock <100ms)

CREATE INDEX IF NOT EXISTS transactions_companyId_dueDate_idx
  ON transactions("companyId", "dueDate");

CREATE INDEX IF NOT EXISTS transactions_companyId_paymentDate_idx
  ON transactions("companyId", "paymentDate");

CREATE INDEX IF NOT EXISTS transactions_companyId_status_dueDate_idx
  ON transactions("companyId", "status", "dueDate");

CREATE INDEX IF NOT EXISTS transactions_companyId_departmentId_status_idx
  ON transactions("companyId", "departmentId", "status");

CREATE INDEX IF NOT EXISTS transactions_companyId_employeeId_idx
  ON transactions("companyId", "employeeId");
