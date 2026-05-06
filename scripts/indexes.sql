-- Índices para acelerar /api/transactions (de ~3s → <300ms)
-- Cole no Supabase Dashboard → SQL Editor → Run
-- CONCURRENTLY = não trava a tabela durante criação

CREATE INDEX CONCURRENTLY IF NOT EXISTS transactions_companyId_dueDate_idx
  ON transactions("companyId", "dueDate");

CREATE INDEX CONCURRENTLY IF NOT EXISTS transactions_companyId_paymentDate_idx
  ON transactions("companyId", "paymentDate");

CREATE INDEX CONCURRENTLY IF NOT EXISTS transactions_companyId_status_dueDate_idx
  ON transactions("companyId", "status", "dueDate");

CREATE INDEX CONCURRENTLY IF NOT EXISTS transactions_companyId_departmentId_status_idx
  ON transactions("companyId", "departmentId", "status");

CREATE INDEX CONCURRENTLY IF NOT EXISTS transactions_companyId_employeeId_idx
  ON transactions("companyId", "employeeId");
