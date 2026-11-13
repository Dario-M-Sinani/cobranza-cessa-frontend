import { fechaCorta } from "./dinero";

// Fecha local (no UTC): con toISOString, desde las 20:00 de Bolivia ya era "mañana".
export function hoyISO(): string {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  const dia = String(hoy.getDate()).padStart(2, "0");
  return `${hoy.getFullYear()}-${mes}-${dia}`;
}

// "2026-11-12" → "12/11/2026".
export function fechaISO(iso: string): string {
  return fechaCorta(iso.replaceAll("-", ""));
}

// "2026-11-12T12:22:58-04:00" → "12:22".
export function hora(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" });
}
