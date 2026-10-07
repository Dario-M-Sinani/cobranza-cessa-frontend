import { apiFetchBlob, apiFetch } from "./client";
import type {
  AperturaCajaFueraDeHorario,
  Caja,
  CobroAgrupado,
  CobroEfectivo,
  Deuda,
  Factura,
  FacturaPagada,
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

// `cantidadComprobantes`: los N comprobantes más antiguos (SIIC no deja saltear
// ninguno). Si se omite, se cobra la deuda completa.
export function generarTransaccionQR(deudaId: number, cantidadComprobantes?: number) {
  return apiFetch<TransaccionQR>("/transacciones-qr/", {
    method: "POST",
    body: cantidadComprobantes
      ? { deuda_id: deudaId, cantidad_comprobantes: cantidadComprobantes }
      : { deuda_id: deudaId },
  });
}

export function cancelarTransaccion(id: number) {
  return apiFetch<TransaccionQR>(`/transacciones-qr/${id}/cancelar/`, { method: "POST" });
}

export function reintentarFacturacion(id: number) {
  return apiFetch<Factura>(`/transacciones-qr/${id}/reintentar_facturacion/`, { method: "POST" });
}

// `cantidadComprobantes`: los N comprobantes más antiguos; si se omite, se
// cobra la deuda completa. `montoRecibido` tiene que cubrir lo que se cobra.
export function registrarCobroEfectivo(deudaId: number, montoRecibido: string, cantidadComprobantes?: number) {
  return apiFetch<CobroEfectivo>("/cobros-efectivo/", {
    method: "POST",
    body: cantidadComprobantes
      ? { deuda_id: deudaId, monto_recibido: montoRecibido, cantidad_comprobantes: cantidadComprobantes }
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

// Todas las facturas ya pagadas del cliente, de la más nueva a la más vieja (SIIC).
export async function listarFacturasPagadas(codigoCliente: string) {
  const r = await apiFetch<{ items: FacturaPagada[] }>(`/clientes/${encodeURIComponent(codigoCliente)}/facturas-pagadas/`);
  return r.items;
}

// PDF real de una factura pagada (reimpresión).
export function obtenerPdfFacturaPagada(factura: FacturaPagada) {
  return apiFetchBlob(`/clientes/${encodeURIComponent(factura.nro_cliente)}/facturas-pagadas/pdf/`, {
    method: "POST",
    body: factura,
  });
}

export interface SeleccionCobro {
  deuda_id: number;
  // Los N comprobantes más antiguos; sin el campo, toda la deuda.
  cantidad_comprobantes?: number;
}

// Un solo pago en efectivo para varios clientes (todo o nada).
export function registrarCobroAgrupado(montoRecibido: string, selecciones: SeleccionCobro[]) {
  return apiFetch<CobroAgrupado>("/cobros-agrupados/", {
    method: "POST",
    body: { monto_recibido: montoRecibido, selecciones },
  });
}

export function obtenerCobroAgrupado(id: number) {
  return apiFetch<CobroAgrupado>(`/cobros-agrupados/${id}/`);
}
