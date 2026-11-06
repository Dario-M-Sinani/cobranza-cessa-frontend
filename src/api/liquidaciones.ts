import { apiFetch, apiFetchBlob } from "./client";
import type { Liquidacion, ResumenLiquidaciones, TransaccionRemota } from "./types";

export interface FiltroLiquidaciones {
  estado?: string;
  cliente?: string;
  banco?: string;
  origen?: string;
  desde?: string;
  hasta?: string;
}

export function listarLiquidaciones(filtro: FiltroLiquidaciones) {
  const params = new URLSearchParams(Object.entries(filtro).filter(([, v]) => v) as [string, string][]);
  return apiFetch<Liquidacion[]>(`/liquidaciones/?${params}`);
}

export async function descargarReporteExcel(filtro: FiltroLiquidaciones) {
  const params = new URLSearchParams(Object.entries(filtro).filter(([, v]) => v) as [string, string][]);
  const blob = await apiFetchBlob(`/liquidaciones/exportar/?${params}`);
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  const ahora = new Date();
  const dos = (n: number) => String(n).padStart(2, "0");
  enlace.href = url;
  enlace.download = `cobros-qr-${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}-${dos(ahora.getHours())}${dos(ahora.getMinutes())}${dos(ahora.getSeconds())}.xlsx`;
  enlace.click();
  URL.revokeObjectURL(url);
}

export function obtenerLiquidacion(id: number) {
  return apiFetch<Liquidacion>(`/liquidaciones/${id}/`);
}

export function resumenLiquidaciones() {
  return apiFetch<ResumenLiquidaciones>("/liquidaciones/resumen/");
}

export function transaccionRemota(id: number) {
  return apiFetch<TransaccionRemota>(`/liquidaciones/${id}/remoto/`);
}

export function reintentarLiquidacion(id: number) {
  return apiFetch<Liquidacion>(`/liquidaciones/${id}/reintentar/`, { method: "POST" });
}

export function pdfLiquidacion(id: number) {
  return apiFetchBlob(`/liquidaciones/${id}/pdf/`);
}

// Cierra sin factura una liquidación revisada a mano (no se vuelve a intentar pagar).
export function descartarLiquidacion(id: number, motivo: string) {
  return apiFetch<Liquidacion>(`/liquidaciones/${id}/descartar/`, { method: "POST", body: { motivo } });
}
