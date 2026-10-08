import { apiFetch, apiFetchBlob } from "./client";
import type { Liquidacion, ResumenLiquidaciones, TransaccionRemota } from "./types";

export interface FiltroLiquidaciones {
  estado?: string;
  cliente?: string;
  banco?: string;
  desde?: string;
  hasta?: string;
}

export function listarLiquidaciones(filtro: FiltroLiquidaciones) {
  const params = new URLSearchParams(Object.entries(filtro).filter(([, v]) => v) as [string, string][]);
  return apiFetch<Liquidacion[]>(`/liquidaciones/?${params}`);
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
