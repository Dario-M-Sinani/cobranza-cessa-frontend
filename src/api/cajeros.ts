import { apiFetch } from "./client";

// Usuarios de la Nest de cobranzas (CESSA y bancos). Ver apps/usuarios/cajeros.py del backend.
export type RolNest = "CAJA" | "COBRANZA" | "ENTIDAD_FINANCIERA" | "SISTEMAS";

export const DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"] as const;
export type Dia = (typeof DIAS)[number];

export interface CajeroResumen {
  id: number;
  username: string;
  nombre: string;
  rol: RolNest;
  rol_descripcion: string;
  habilitado: boolean;
  entidad_financiera_id: number;
  caja_hoy: boolean;
  caja_codigo: number | null;
}

export interface Entidad {
  id: number;
  descripcion: string;
}

export interface FichaCajero {
  id?: number;
  username: string;
  nombre: string;
  rol: RolNest;
  habilitado: boolean;
  entidad_financiera_id: number;
  hora_inicial: string;
  hora_final: string;
  habilitacion_inicio: string;
  habilitacion_fin: string;
  dias: Record<Dia, boolean>;
  password?: string;
}

export function listarCajeros(entidadId?: number) {
  const q = entidadId ? `?entidad_financiera_id=${entidadId}` : "";
  return apiFetch<{ cajeros: CajeroResumen[]; entidades: Entidad[] }>(`/cajeros/${q}`);
}

export function obtenerCajero(id: number) {
  return apiFetch<FichaCajero>(`/cajeros/${id}/`);
}

export function crearCajero(ficha: FichaCajero) {
  return apiFetch<unknown>("/cajeros/", { method: "POST", body: ficha });
}

export function actualizarCajero(username: string, cambios: Partial<FichaCajero>) {
  return apiFetch<unknown>(`/cajeros/${encodeURIComponent(username)}/`, { method: "PATCH", body: cambios });
}
