import { Fragment, useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client";
import {
  listarLiquidaciones,
  obtenerLiquidacion,
  pdfLiquidacion,
  reintentarLiquidacion,
  resumenLiquidaciones,
  transaccionRemota,
  type FiltroLiquidaciones,
} from "../api/liquidaciones";
import type { Liquidacion, ResumenLiquidaciones, TransaccionRemota } from "../api/types";
import { aCentavos, formatoBs } from "../utils/dinero";

const BANCOS: Record<string, string> = { sip_bisa: "BISA", bnb: "BNB" };
const ESTADOS: { valor: string; etiqueta: string }[] = [
  { valor: "", etiqueta: "Todos" },
  { valor: "error", etiqueta: "Con error" },
  { valor: "pendiente", etiqueta: "Pendientes" },
  { valor: "facturado", etiqueta: "Facturados" },
];

function fechaHora(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("es-BO", { dateStyle: "short", timeStyle: "short" }) : "—";
}

/**
 * Pagos QR de la web (cessa-laravel) que el gateway liquida como factura en el SIIC: estado,
 * motivo si fallaron, PDF y reintento. Para supervisor/admin. Se actualiza sola cada minuto.
 */
export function LiquidacionesPage() {
  const [filtro, setFiltro] = useState<FiltroLiquidaciones>({ estado: "" });
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[] | null>(null);
  const [resumen, setResumen] = useState<ResumenLiquidaciones | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<Liquidacion | null>(null);
  const [remoto, setRemoto] = useState<TransaccionRemota | string | null>(null);
  const [ocupada, setOcupada] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [lista, res] = await Promise.all([listarLiquidaciones(filtro), resumenLiquidaciones()]);
      setLiquidaciones(lista);
      setResumen(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar los pagos web.");
    }
  }, [filtro]);

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, 60_000);
    return () => clearInterval(intervalo);
  }, [cargar]);

  async function alternarDetalle(id: number) {
    setRemoto(null);
    if (abierta === id) {
      setAbierta(null);
      return;
    }
    setAbierta(id);
    setDetalle(null);
    try {
      setDetalle(await obtenerLiquidacion(id));
    } catch (err) {
      setAviso(err instanceof ApiError ? err.message : "No se pudo cargar el detalle.");
    }
  }

  async function verRemoto(id: number) {
    setRemoto("Consultando...");
    try {
      setRemoto(await transaccionRemota(id));
    } catch (err) {
      setRemoto(err instanceof ApiError ? err.message : "No se pudo consultar api-cobranzas.");
    }
  }

  async function reintentar(l: Liquidacion) {
    setOcupada(l.id);
    setAviso(null);
    try {
      const resultado = await reintentarLiquidacion(l.id);
      setAviso(
        resultado.estado === "facturado"
          ? `Liquidación ${l.alias}: facturada.`
          : `Liquidación ${l.alias}: sigue con error — ${resultado.error}`,
      );
      await cargar();
    } catch (err) {
      setAviso(err instanceof ApiError ? err.message : "No se pudo reintentar.");
    } finally {
      setOcupada(null);
    }
  }

  async function verPdf(l: Liquidacion) {
    const pestana = window.open("", "_blank");
    try {
      const url = URL.createObjectURL(await pdfLiquidacion(l.id));
      if (pestana) pestana.location.assign(url);
      else window.location.assign(url);
    } catch (err) {
      pestana?.close();
      setAviso(err instanceof ApiError ? err.message : "No se pudo obtener el PDF.");
    }
  }

  const hoy = resumen?.hoy;

  return (
    <div className="pagina pagina--ancha">
      <div className="pagina__encabezado">
        <h1>Pagos web</h1>
        <button className="boton-secundario" onClick={cargar}>
          Actualizar
        </button>
      </div>
      <p className="detalle-fecha">
        Pagos QR de la web que el gateway registra como factura en el SIIC. Se actualiza cada minuto.
      </p>

      {hoy && resumen && (
        <div className="tarjetas-resumen">
          <div className="tarjeta stat">
            <p className="stat__etiqueta">Facturados hoy</p>
            <strong className="monto">{hoy.facturado.cantidad}</strong>
            <span className="detalle-fecha">Bs. {formatoBs(aCentavos(hoy.facturado.monto))}</span>
          </div>
          <div className="tarjeta stat">
            <p className="stat__etiqueta">Pendientes hoy</p>
            <strong className="monto">{hoy.pendiente.cantidad}</strong>
            <span className="detalle-fecha">Bs. {formatoBs(aCentavos(hoy.pendiente.monto))}</span>
          </div>
          <button
            type="button"
            className={`tarjeta stat stat--boton ${resumen.errores_abiertos > 0 ? "stat--alerta" : ""}`}
            onClick={() => setFiltro({ ...filtro, estado: "error" })}
          >
            <p className="stat__etiqueta">Con error (todos los días)</p>
            <strong className="monto">{resumen.errores_abiertos}</strong>
            <span className="detalle-fecha">
              {resumen.errores_abiertos > 0 ? "Pagaron y no tienen factura: revisar" : "Nada pendiente"}
            </span>
          </button>
        </div>
      )}

      <div className="filtros">
        <div className="segmentado" role="tablist">
          {ESTADOS.map((e) => (
            <button
              key={e.valor}
              role="tab"
              aria-selected={(filtro.estado ?? "") === e.valor}
              className={(filtro.estado ?? "") === e.valor ? "segmentado__opcion segmentado__opcion--activa" : "segmentado__opcion"}
              onClick={() => setFiltro({ ...filtro, estado: e.valor })}
            >
              {e.etiqueta}
            </button>
          ))}
        </div>
        <input
          placeholder="N° de cliente"
          inputMode="numeric"
          value={filtro.cliente ?? ""}
          onChange={(e) => setFiltro({ ...filtro, cliente: e.target.value })}
        />
        <select value={filtro.banco ?? ""} onChange={(e) => setFiltro({ ...filtro, banco: e.target.value })}>
          <option value="">Todos los bancos</option>
          <option value="sip_bisa">BISA</option>
          <option value="bnb">BNB</option>
        </select>
        <label>
          Desde <input type="date" value={filtro.desde ?? ""} onChange={(e) => setFiltro({ ...filtro, desde: e.target.value })} />
        </label>
        <label>
          Hasta <input type="date" value={filtro.hasta ?? ""} onChange={(e) => setFiltro({ ...filtro, hasta: e.target.value })} />
        </label>
      </div>

      {error && <p className="mensaje-error">{error}</p>}
      {aviso && <p className="aviso">{aviso}</p>}

      {liquidaciones && liquidaciones.length === 0 && <p className="detalle-fecha">No hay pagos web con ese filtro.</p>}
      {liquidaciones && liquidaciones.length > 0 && (
        <table className="tabla tabla--compacta">
          <thead>
            <tr>
              <th>Recibido</th>
              <th>Cliente</th>
              <th>Banco</th>
              <th className="num">Monto (Bs.)</th>
              <th>Estado</th>
              <th>Motivo</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {liquidaciones.map((l) => (
              <Fragment key={l.id}>
                <tr className="fila-clic" onClick={() => alternarDetalle(l.id)}>
                  <td>{fechaHora(l.recibido_en)}</td>
                  <td>
                    {l.nro_cliente}
                    <span className="detalle-fecha"> · {l.cantidad_comprobantes} comp.</span>
                  </td>
                  <td>{BANCOS[l.banco] ?? (l.banco || "—")}</td>
                  <td className="num">{formatoBs(aCentavos(l.monto))}</td>
                  <td>
                    <span className={`estado estado--${l.estado}`}>{l.estado}</span>
                    {l.intentos > 0 && <span className="detalle-fecha"> · {l.intentos} int.</span>}
                  </td>
                  <td className="motivo" title={l.error}>
                    {l.error || "—"}
                  </td>
                  <td className="num acciones-fila" onClick={(e) => e.stopPropagation()}>
                    {l.tiene_pdf && (
                      <button type="button" className="boton-chico boton-secundario" onClick={() => verPdf(l)}>
                        PDF
                      </button>
                    )}
                    {l.estado !== "facturado" && (
                      <button type="button" className="boton-chico" onClick={() => reintentar(l)} disabled={ocupada === l.id}>
                        {ocupada === l.id ? "..." : "Reintentar"}
                      </button>
                    )}
                  </td>
                </tr>
                {abierta === l.id && (
                  <tr className="fila-detalle">
                    <td colSpan={7}>
                      <DetalleLiquidacion
                        liquidacion={detalle?.id === l.id ? detalle : null}
                        remoto={remoto}
                        onVerRemoto={() => verRemoto(l.id)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DetalleLiquidacion(props: {
  liquidacion: Liquidacion | null;
  remoto: TransaccionRemota | string | null;
  onVerRemoto: () => void;
}) {
  const { liquidacion: l, remoto } = props;
  if (!l) return <p className="detalle-fecha">Cargando...</p>;
  return (
    <div className="detalle-liquidacion">
      <div>
        <p className="detalle-fecha">
          Recibo {l.alias} · pagado {fechaHora(l.fecha_pago)} · procesado {fechaHora(l.procesado_en)}
        </p>
        {l.error && <p className="mensaje-error">{l.error}</p>}
        <table className="tabla tabla--compacta">
          <tbody>
            {(l.detalle ?? []).map((item, i) => (
              <tr key={`${item.nro_comprobante}-${i}`}>
                <td>
                  {item.detalle} <span className="detalle-fecha">N° {item.nro_comprobante}</span>
                </td>
                <td className="num">
                  {item.debito_credito?.toUpperCase() === "CREDITO" ? "−" : ""}
                  {formatoBs(Math.abs(aCentavos(item.importe)))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        {l.cobranzas_uuid ? (
          <>
            <p className="detalle-fecha">Transacción en api-cobranzas: {l.cobranzas_uuid}</p>
            {remoto === null && (
              <button type="button" className="boton-chico boton-secundario" onClick={props.onVerRemoto}>
                Ver estado en api-cobranzas
              </button>
            )}
            {typeof remoto === "string" && <p className="detalle-fecha">{remoto}</p>}
            {remoto && typeof remoto === "object" && (
              <p>
                <strong>{remoto.estado}</strong> · lote {remoto.lote} · caja {remoto.caja_codigo} · Bs.{" "}
                {formatoBs(aCentavos(remoto.total_pagado))}
                {remoto.fecha_anulacion ? ` · ANULADA ${remoto.fecha_anulacion}` : ""}
              </p>
            )}
          </>
        ) : (
          <p className="detalle-fecha">Todavía no tiene transacción en api-cobranzas.</p>
        )}
      </div>
    </div>
  );
}
