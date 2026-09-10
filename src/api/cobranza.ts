import { apiFetchBlob, apiFetch } from "./client";
import type {
  AperturaCajaFueraDeHorario,
  Caja,
  CobroEfectivo,
  Deuda,
  Factura,
  ResumenCaja,
  TransaccionQR,
} from "./types";

export function consultarDeuda(codigoExterno: string) {
  return apiFetch<Deuda>("/deudas/consultar/", {
    method: "POST",
    body: { codigo_externo: codigoExterno },
  });
}

export function listarTransacciones() {
  return apiFetch<TransaccionQR[]>("/transacciones-qr/");
}

export function obtenerTransaccion(id: number) {
  return apiFetch<TransaccionQR>(`/transacciones-qr/${id}/`);
}

export function obtenerCobroEfectivo(id: number) {
  return apiFetch<CobroEfectivo>(`/cobros-efectivo/${id}/`);
}

// `monto`: adelanto opcional -- si se omite, se cobra la deuda completa.
export function generarTransaccionQR(deudaId: number, monto?: string) {
  return apiFetch<TransaccionQR>("/transacciones-qr/", {
    method: "POST",
    body: monto ? { deuda_id: deudaId, monto } : { deuda_id: deudaId },
  });
}

export function cancelarTransaccion(id: number) {
  return apiFetch<TransaccionQR>(`/transacciones-qr/${id}/cancelar/`, { method: "POST" });
}

export function reintentarFacturacion(id: number) {
  return apiFetch<Factura>(`/transacciones-qr/${id}/reintentar_facturacion/`, { method: "POST" });
}

// `montoACobrar`: adelanto opcional -- si se omite, se cobra la deuda
// completa y `montoRecibido` debe cubrirla.
export function registrarCobroEfectivo(deudaId: number, montoRecibido: string, montoACobrar?: string) {
  return apiFetch<CobroEfectivo>("/cobros-efectivo/", {
    method: "POST",
    body: montoACobrar
      ? { deuda_id: deudaId, monto_recibido: montoRecibido, monto_a_cobrar: montoACobrar }
      : { deuda_id: deudaId, monto_recibido: montoRecibido },
  });
}

export function listarFacturas() {
  return apiFetch<Factura[]>("/facturas/");
}

export function listarCajas() {
  return apiFetch<Caja[]>("/cajas/");
}

export function obtenerResumenCaja(id: number) {
  return apiFetch<ResumenCaja>(`/cajas/${id}/resumen/`);
}

// Cajera abriendo su propia caja: sin body.
export function abrirCaja() {
  return apiFetch<Caja>("/cajas/", { method: "POST", body: {} });
}

// Supervisor/admin abriendo la caja de un cajero puntual (ej. fuera de
// horario) -- `motivo` es obligatorio del lado del backend solo si es
// fuera de horario, pero se manda siempre para no adivinar la hora acá.
export function abrirCajaParaCajero(cajeroId: number, motivo: string) {
  return apiFetch<Caja>("/cajas/", { method: "POST", body: { cajero_id: cajeroId, motivo } });
}

export function cerrarCaja(id: number) {
  return apiFetch<Caja>(`/cajas/${id}/cerrar/`, { method: "POST" });
}

export function reabrirCaja(id: number, motivo: string) {
  return apiFetch<Caja>(`/cajas/${id}/reabrir/`, { method: "POST", body: { motivo } });
}

export function listarAperturasFueraDeHorario() {
  return apiFetch<AperturaCajaFueraDeHorario[]>("/cajas/aperturas_fuera_de_horario/");
}

export async function descargarTransaccionesCSV() {
  const blob = await apiFetchBlob("/transacciones-qr/exportar_csv/");
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = "transacciones_qr.csv";
  enlace.click();
  URL.revokeObjectURL(url);
}
