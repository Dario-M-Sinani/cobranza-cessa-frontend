import { apiFetch } from "./client";
import type { LogAuditoria } from "./types";

export function listarAuditoria() {
  return apiFetch<LogAuditoria[]>("/auditoria/");
}
