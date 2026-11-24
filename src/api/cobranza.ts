import { apiFetchBlob, apiFetch } from "./client";
import type {
  AgenciasCaja,
  FormasPago,
  NuevoDocumentoCobro,
  CierreCaja,
  NuevoDocumentoCierre,
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
/** Un solo QR por el total de varios clientes (como "Facturas programadas a pagar" + QR de la app Java). */
export function generarQRAgrupado(items: { deuda_id: number; cantidad_comprobantes?: number }[]) {
  return apiFetch<TransaccionQR>("/transacciones-qr/grupo/", { method: "POST", body: { items } });
}

/** Comprobante de un QR de varios clientes, con la misma forma que un cobro en efectivo de varios clientes. */
export function obtenerQRAgrupado(id: number) {
  return apiFetch<CobroAgrupado>(`/transacciones-qr/grupo/${id}/`);
}

export function generarTransaccionQR(deudaId: number, cantidadComprobantes?: number) {
  return apiFetch<TransaccionQR>("/transacciones-qr/", {
    method: "POST",
    body: cantidadComprobantes
      ? { deuda_id: deudaId, cantidad_comprobantes: cantidadComprobantes }
      : { deuda_id: deudaId },
  });
}

// Pregunta si el cliente ya pagó el QR (el backend consulta a SIP en el momento, con tope).
export function consultarEstadoQR(id: number) {
  return apiFetch<TransaccionQR>(`/transacciones-qr/${id}/estado/`);
}

// Anula el QR en SIP y en el panel. Si el cliente justo pagó, vuelve PAGADO.
export function cancelarTransaccion(id: number) {
  return apiFetch<TransaccionQR>(`/transacciones-qr/${id}/cancelar/`, { method: "POST" });
}

export function reintentarFacturacion(id: number) {
  return apiFetch<Factura>(`/transacciones-qr/${id}/reintentar_facturacion/`, { method: "POST" });
}

// `cantidadComprobantes`: los N comprobantes más antiguos; si se omite, se
// cobra la deuda completa. `montoRecibido` tiene que cubrir lo que se cobra.
// `documento`: pagado con cheque, depósito, tarjeta... (sin vuelto); sin él, efectivo.
export function registrarCobroEfectivo(
  deudaId: number,
  montoRecibido: string,
  cantidadComprobantes?: number,
  documento?: NuevoDocumentoCobro,
) {
  return apiFetch<CobroEfectivo>("/cobros-efectivo/", {
    method: "POST",
    body: {
      deuda_id: deudaId,
      monto_recibido: montoRecibido,
      ...(cantidadComprobantes ? { cantidad_comprobantes: cantidadComprobantes } : {}),
      ...(documento ? { documento } : {}),
    },
  });
}

// Tipos de documento y bancos del SIIC para cobrar sin billetes (solo con caja del SIIC).
export function obtenerFormasPago() {
  return apiFetch<FormasPago>("/cobros-efectivo/formas-pago/");
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
// Cajera de la Nest: su caja del SIIC se abre en una agencia de su entidad y con el efectivo inicial.
export function abrirCaja(agenciaSigla = "", montoInicial = "0") {
  return apiFetch<Caja>("/cajas/", {
    method: "POST",
    body: { agencia_sigla: agenciaSigla, monto_inicial: montoInicial || "0" },
  });
}

export function listarAgenciasCaja() {
  return apiFetch<AgenciasCaja>("/cajas/agencias/");
}

// Supervisor/admin abriendo la caja de un cajero puntual (ej. fuera de
// horario) -- `motivo` es obligatorio del lado del backend solo si es
// fuera de horario, pero se manda siempre para no adivinar la hora acá.
export function abrirCajaParaCajero(cajeroId: number, motivo: string) {
  return apiFetch<Caja>("/cajas/", { method: "POST", body: { cajero_id: cajeroId, motivo } });
}

export function cerrarCaja(id: number, descripcion = "") {
  return apiFetch<Caja>(`/cajas/${id}/cerrar/`, { method: "POST", body: { descripcion } });
}

// --- Cierre de la caja del SIIC (arqueo) ---
export function obtenerCierreCaja(id: number) {
  return apiFetch<CierreCaja>(`/cajas/${id}/cierre/`);
}

// Efectivo contado por cortes: en Bs ("200"... "010") o en dólares (moneda "D": "100"... "1").
export function declararEfectivo(id: number, cortes: Record<string, number>, moneda: "B" | "D" = "B") {
  return apiFetch<{ cortes: Record<string, number>; efectivo_bs?: string; efectivo_sus?: string }>(
    `/cajas/${id}/efectivo/`,
    { method: "PUT", body: { moneda, cortes } },
  );
}

export function guardarDocumentoCierre(id: number, documento: NuevoDocumentoCierre) {
  return apiFetch<unknown>(`/cajas/${id}/documentos/`, { method: "POST", body: documento });
}

export async function abrirReporteCierre(id: number) {
  const blob = await apiFetchBlob(`/cajas/${id}/reporte-cierre/`);
  window.open(URL.createObjectURL(blob), "_blank", "noopener");
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
export function registrarCobroAgrupado(montoRecibido: string, selecciones: SeleccionCobro[], documento?: NuevoDocumentoCobro) {
  return apiFetch<CobroAgrupado>("/cobros-agrupados/", {
    method: "POST",
    body: { monto_recibido: montoRecibido, selecciones, ...(documento ? { documento } : {}) },
  });
}

export function obtenerCobroAgrupado(id: number) {
  return apiFetch<CobroAgrupado>(`/cobros-agrupados/${id}/`);
}

export type TipoComprobante = "efectivo" | "grupo" | "qr" | "qrgrupo";

export interface ComprobanteDelDia {
  tipo: TipoComprobante;
  id: number;
  numero: string;
  fecha: string;
  forma_pago: "Efectivo" | "QR";
  cajero: string;
  monto: string;
  clientes: { codigo: string; nombre: string }[];
  facturas: string[];
  facturas_ids: number[]; // para abrir el PDF de la factura del SIIC
  /** Cobros de varios clientes (grupo, QR de varios, proforma): cada cliente con su monto y su factura. */
  detalle?: { codigo: string; nombre: string; monto: string; factura: string; factura_id: number | null }[];
  impresiones: number;
  ultima_impresion: string | null;
  anulacion: { por: string; en: string; motivo: string } | null;
  se_puede_anular: boolean;
  /** Entidad financiera de la cajera (CESSA o un banco); null = usuario local del panel. */
  entidad_id: number | null;
}

// Anula un cobro del día (supervisor/admin, con motivo). Un cobro de varios clientes se anula entero.
export function anularComprobante(tipo: TipoComprobante, id: number, motivo: string) {
  return apiFetch<{ anuladas: number }>("/comprobantes/anular/", { method: "POST", body: { tipo, id, motivo } });
}

// Cobros del panel de un día (supervisor/admin), para encontrar y reimprimir un comprobante.
export function listarComprobantesDelDia(fecha: string) {
  return apiFetch<{ fecha: string; comprobantes: ComprobanteDelDia[] }>(
    `/comprobantes/?fecha=${encodeURIComponent(fecha)}`
  );
}

// Pide permiso para imprimir el comprobante interno de un cobro. La cajera lo imprime una
// sola vez; reimprimir es de supervisor/admin (403 para la cajera) y queda en Auditoría.
export function registrarImpresion(tipo: TipoComprobante, id: number) {
  return apiFetch<{ tipo: TipoComprobante; id: number; es_reimpresion: boolean; impresiones: number }>(
    "/comprobantes/imprimir/",
    { method: "POST", body: { tipo, id } }
  );
}

// ---------- Lista y reportes de QR (como listaQr de la app Java) ----------
export interface FiltrosQR {
  desde: string;
  hasta: string;
  estado?: string;
  cajero?: string;
  clientes?: string; // "101194, 101591"
  qr?: string;
}

export interface FilaQR {
  id: number;
  creado_en: string;
  pagado_en: string | null;
  cliente: { codigo: string; nombre: string };
  monto: string;
  estado: TransaccionQR["estado"];
  estado_descripcion: string;
  cajero: string;
  factura: string;
  factura_pendiente: boolean;
  id_operacion: string;
}

export interface ResumenQR {
  total: number;
  pagados: number;
  monto_pagado: string;
}

export interface DiaQR {
  dia: string;
  generados: number;
  pagados: number;
  monto_pagado: string;
  anulados: number;
  vencidos: number;
  con_error: number;
  pendientes: number;
}

export function consultaQR(filtros: FiltrosQR, extra: Record<string, string | number> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...filtros, ...extra })) {
    if (v !== undefined && String(v).trim() !== "") p.set(k, String(v).trim());
  }
  return p.toString();
}

export function buscarQR(filtros: FiltrosQR, pagina: number) {
  return apiFetch<ResumenQR & { pagina: number; paginas: number; por_pagina: number; resultados: FilaQR[] }>(
    `/transacciones-qr/buscar/?${consultaQR(filtros, { pagina })}`
  );
}

export function totalesQRPorDia(filtros: FiltrosQR) {
  return apiFetch<{ desde: string; hasta: string; dias: DiaQR[]; totales: Omit<DiaQR, "dia"> }>(
    `/transacciones-qr/totales-por-dia/?${consultaQR(filtros)}`
  );
}

export function detalleQR(filtros: FiltrosQR) {
  return apiFetch<ResumenQR & { desde: string; hasta: string; resultados: FilaQR[] }>(
    `/transacciones-qr/detalle/?${consultaQR(filtros)}`
  );
}

export async function exportarQRTxt(filtros: FiltrosQR) {
  const blob = await apiFetchBlob(`/transacciones-qr/exportar-txt/?${consultaQR(filtros)}`);
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `qr_${filtros.desde.replaceAll("-", "")}_${filtros.hasta.replaceAll("-", "")}.txt`;
  enlace.click();
  URL.revokeObjectURL(url);
}

// ---------- Cotización del dólar: la del SIIC (manda, con ella se cierran las cajas) y la oficial del BCB ----------
export interface CotizacionDolar {
  fecha: string;
  siic: string | null;
  siic_leida_en: string | null;
  siic_error: string;
  bcb: string | null;
  bcb_vigencia: string;
  bcb_fuente: string;
  bcb_leida_en: string | null;
  bcb_error: string;
  /** Último intento fallido de la carga automática de ese día. */
  carga_error: string;
  /** El panel carga solo la del BCB en el SIIC cuando falta. */
  carga_automatica: boolean;
  /** Cargas y correcciones del panel en el SIIC para ese día, de la más nueva a la más vieja. */
  cambios: CambioCotizacion[];
  alertas: { tipo: "sin_siic" | "carga_fallida" | "diferencia"; mensaje: string }[];
}

export interface CambioCotizacion {
  fecha: string;
  accion: "carga_automatica" | "carga_manual" | "correccion";
  accion_texto: string;
  valor_anterior: string | null;
  valor_nuevo: string;
  origen: string;
  motivo: string;
  /** null = la carga automática */
  usuario: string | null;
  tabla: string;
  creado_en: string;
}

export function obtenerCotizacionDolar() {
  return apiFetch<CotizacionDolar>("/cotizacion-dolar/");
}

export function historialCotizacionDolar(desde: string, hasta: string) {
  return apiFetch<{ desde: string; hasta: string; dias: CotizacionDolar[] }>(
    `/cotizacion-dolar/historial/?desde=${desde}&hasta=${hasta}`
  );
}

export function releerCotizacionBcb() {
  return apiFetch<CotizacionDolar>("/cotizacion-dolar/releer-bcb/", { method: "POST" });
}

/** Deja `valor` como cotización de ese día en el SIIC (la carga si falta, la corrige si tiene otra). Queda registrado. */
export function cambiarCotizacionSiic(fecha: string, valor: string, motivo: string) {
  return apiFetch<CotizacionDolar>(`/cotizacion-dolar/${fecha}/`, { method: "PUT", body: { valor, motivo } });
}
