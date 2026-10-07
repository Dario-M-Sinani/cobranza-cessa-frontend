export type Rol = "cajera" | "supervisor" | "admin";

export interface Cliente {
  id: number;
  codigo_externo: string;
  nombre: string;
  nit_ci: string;
}

// Comprobante pendiente tal como lo devuelve SIIC. `importe` viene firmado
// (negativo = nota de crédito). Las fechas son "yyyymmdd".
export interface ItemDeuda {
  codigo_sucursal: string;
  nro_comprobante: string;
  tipo: string;
  fecha: string;
  fecha_vencimiento?: string;
  anio: number;
  mes: number;
  importe: string;
  detalle: string;
  debito_credito: string;
}

export interface Deuda {
  id: number;
  cliente: Cliente;
  monto: string;
  fecha_consulta: string;
  // En el orden en que SIIC exige pagarlos: se cobra siempre un prefijo.
  items: ItemDeuda[];
}

export type EstadoTransaccion =
  | "generado"
  | "pendiente_confirmacion"
  | "pagado"
  | "vencido"
  | "error"
  | "cancelado";

export type EstadoEnvioFactura = "pendiente" | "enviado" | "error";

export interface Factura {
  id: number;
  transaccion_qr: number | null;
  cobro_efectivo: number | null;
  numero_factura: string;
  estado_envio: EstadoEnvioFactura;
  emitida_en: string | null;
}

export interface TransaccionQR {
  id: number;
  deuda: Deuda;
  usuario: string;
  id_operacion_mc4: string;
  monto_snapshot: string;
  estado: EstadoTransaccion;
  creado_en: string;
  actualizado_en: string;
  factura: Factura | null;
  // Solo viene poblado en la respuesta de POST /transacciones-qr/ (la
  // pasarela no permite volver a pedir la imagen después).
  imagen_qr_base64: string | null;
  items_cobrados: ItemDeuda[];
}

export type EstadoCaja = "abierta" | "cerrada";

export interface Caja {
  id: number;
  cajero: string;
  estado: EstadoCaja;
  creada_en: string;
  abierta_en: string;
  abierta_por: string;
  cerrada_en: string | null;
  cerrada_por: string | null;
}

export interface AperturaCajaFueraDeHorario {
  id: number;
  caja: number;
  usuario: string;
  motivo: string;
  creado_en: string;
}

export interface CobroEfectivo {
  id: number;
  deuda: Deuda;
  usuario: string;
  caja: number | null;
  monto_snapshot: string;
  monto_recibido: string;
  vuelto: string;
  creado_en: string;
  factura: Factura | null;
  items_cobrados: ItemDeuda[];
}

export interface ResumenFormaPago {
  cantidad: number;
  monto: string;
}

export interface ResumenPorCajero {
  cajero: string;
  cantidad_cobros: number;
  monto_total: string;
}

export interface ResumenDashboard {
  desde: string;
  hasta: string;
  monto_total: string;
  cantidad_cobros: number;
  por_forma_pago: {
    qr: ResumenFormaPago;
    efectivo: ResumenFormaPago;
  };
  facturas_registradas: number;
  cajas: Caja[];
  por_cajero: ResumenPorCajero[];
}

export interface ResumenCaja {
  monto_total: string;
  cantidad_cobros: number;
  por_forma_pago: {
    qr: ResumenFormaPago;
    efectivo: ResumenFormaPago;
  };
  facturas_registradas: number;
  qr_pendientes_de_confirmar: number;
}

export interface LogAuditoria {
  id: number;
  usuario: string | null;
  accion: string;
  entidad_afectada: string;
  creado_en: string;
}

export interface UsuarioAdmin {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  rol: Rol;
  activo: boolean;
  is_active: boolean;
}

// Factura ya pagada (por cualquier canal), tal como la devuelve el SIIC.
export interface FacturaPagada {
  codigo_sucursal: string;
  nro_comprobante: string;
  nro_suministro: string;
  fecha: string;
  tipo: string;
  letra_comprobante: string;
  nro_autorizacion: string;
  nro_cliente: string;
  importe: string;
  pago_fecha: string;
  pago_hora: string;
  detalle: string;
}
