import { apiFetch } from "./client";
import type { ResumenDashboard } from "./types";

export function obtenerResumenDashboard(desde?: string, hasta?: string) {
  const params = new URLSearchParams();
  if (desde) params.set("desde", desde);
  if (hasta) params.set("hasta", hasta);
  const query = params.toString();
  return apiFetch<ResumenDashboard>(`/dashboard/resumen/${query ? `?${query}` : ""}`);
}
