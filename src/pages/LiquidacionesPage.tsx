import { Fragment, useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client";
import {
  descargarReporteExcel,
  listarLiquidaciones,
  obtenerLiquidacion,
  pdfLiquidacion,
  descartarLiquidacion,
  reintentarLiquidacion,
  resumenLiquidaciones,
  transaccionRemota,
  type FiltroLiquidaciones,
} from "../api/liquidaciones";
import type { Liquidacion, ResumenLiquidaciones, TransaccionRemota } from "../api/types";
import { aCentavos, formatoBs } from "../utils/dinero";
import { Copiable } from "../components/Copiable";

const BANCOS: Record<string, string> = { sip_bisa: "BISA", bnb: "BNB" };
const CANALES: Record<string, string> = { cessa_laravel_web: "Web", bot_telegram: "bot-telegram", kiosco: "Cajero automático" };
const ESTADOS: { valor: string; etiqueta: string }[] = [
  { valor: "", etiqueta: "Todos" },
  { valor: "error", etiqueta: "Con error" },
  { valor: "pendiente", etiqueta: "Pendientes" },
  { valor: "facturado", etiqueta: "Facturados" },
  { valor: "descartado", etiqueta: "Descartados" },
  { valor: "expirado", etiqueta: "QR expirados" },
  { valor: "anulado", etiqueta: "QR anulados" },
];
// Cómo se muestra cada estado (los de QR sin pagar, como el reporte de la web).
const ETIQUETAS_ESTADO: Record<string, string> = {
  expirado: "Expirado",
  anulado: "Anulado",
  vigente: "Sin pagar (vigente)",
};

const claveFila = (l: Liquidacion) => `${l.tipo ?? "pago"}-${l.id}`;

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
  const [abierta, setAbierta] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Liquidacion | null>(null);
  const [remoto, setRemoto] = useState<TransaccionRemota | string | null>(null);
  const [ocupada, setOcupada] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  // Mismo filtro que la tabla (estado, cliente, banco, canal, fechas); hasta 5000 filas.
  async function exportar() {
    setExportando(true);
    setAviso(null);
    try {
      await descargarReporteExcel(filtro);
    } catch (err) {
      setAviso(err instanceof ApiError ? err.message : "No se pudo generar el Excel.");
    } finally {
      setExportando(false);
    }
  }

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

  async function alternarDetalle(l: Liquidacion) {
    setRemoto(null);
    const clave = claveFila(l);
    if (abierta === clave) {
      setAbierta(null);
      return;
    }
    setAbierta(clave);
    // Un QR sin pagar ya trae su detalle en la lista.
    setDetalle(l.tipo === "qr" ? l : null);
    if (l.tipo === "qr") return;
    try {
      setDetalle(await obtenerLiquidacion(l.id));
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

  async function descartar(l: Liquidacion) {
    const motivo = window.prompt(
      `Descartar el pago de ${l.nro_cliente} (Bs. ${formatoBs(aCentavos(l.monto))}): no se volverá a intentar facturar.\nMotivo:`,
    );
    if (!motivo || !motivo.trim()) return;
    setOcupada(l.id);
    setAviso(null);
    try {
      await descartarLiquidacion(l.id, motivo.trim());
      setAviso(`Liquidación ${l.alias}: descartada.`);
      await cargar();
    } catch (err) {
      setAviso(err instanceof ApiError ? err.message : "No se pudo descartar.");
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
        <div className="acciones">
          <button className="boton-secundario" onClick={exportar} disabled={exportando}>
            {exportando ? "Generando..." : "Exportar Excel"}
          </button>
          <button className="boton-secundario" onClick={cargar}>
            Actualizar
          </button>
        </div>
      </div>
      <p className="detalle-fecha">
        Pagos QR de la web y del bot que el gateway registra como factura en el SIIC, y los QR que se generaron y no se
        pagaron (expirados o anulados). Se actualiza cada minuto.
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
          {resumen.qr_hoy && (
            <button
              type="button"
              className="tarjeta stat stat--boton"
              onClick={() => setFiltro({ ...filtro, estado: "expirado" })}
            >
              <p className="stat__etiqueta">QR expirados hoy</p>
              <strong className="monto">{resumen.qr_hoy.expirado.cantidad}</strong>
              <span className="detalle-fecha">
                Bs. {formatoBs(aCentavos(resumen.qr_hoy.expirado.monto))} · {resumen.qr_hoy.vigente.cantidad} sin pagar
                vigentes
              </span>
            </button>
          )}
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
        <select value={filtro.origen ?? ""} onChange={(e) => setFiltro({ ...filtro, origen: e.target.value })}>
          <option value="">Todos los canales</option>
          <option value="cessa_laravel_web">Solo web</option>
          <option value="bot_telegram">Solo bot-telegram</option>
          <option value="kiosco">Solo cajero automático</option>
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
              <th>Canal</th>
              <th>Banco</th>
              <th className="num">Monto (Bs.)</th>
              <th>Estado</th>
              <th>Motivo</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {liquidaciones.map((l) => (
              <Fragment key={claveFila(l)}>
                <tr className={l.tipo === "qr" ? "fila-clic fila-qr" : "fila-clic"} onClick={() => alternarDetalle(l)}>
                  <td>{fechaHora(l.recibido_en)}</td>
                  <td>
                    <Copiable texto={l.nro_cliente} />
                    <span className="detalle-fecha"> · {l.cantidad_comprobantes} comp.</span>
                  </td>
                  <td>
                    <span className={`canal canal--${l.origen}`}>{CANALES[l.origen] ?? l.origen}</span>
                  </td>
                  <td>{BANCOS[l.banco] ?? (l.banco || "—")}</td>
                  <td className="num">{formatoBs(aCentavos(l.monto))}</td>
                  <td>
                    <span className={`estado estado--${l.estado}`}>{ETIQUETAS_ESTADO[l.estado] ?? l.estado}</span>
                    {l.intentos > 0 && <span className="detalle-fecha"> · {l.intentos} int.</span>}
                  </td>
                  <td className="motivo" title={l.observacion || l.nota_descarte || l.error}>
                    {l.tipo === "qr"
                      ? l.observacion || "No se pagó"
                      : l.estado === "descartado"
                        ? `Descartado: ${l.nota_descarte}`
                        : l.error || "—"}
                  </td>
                  <td className="num acciones-fila" onClick={(e) => e.stopPropagation()}>
                    {l.tiene_pdf && (
                      <button type="button" className="boton-chico boton-secundario" onClick={() => verPdf(l)}>
                        PDF
                      </button>
                    )}
                    {l.tipo !== "qr" && (l.estado === "error" || l.estado === "pendiente") && (
                      <>
                        <button type="button" className="boton-chico" onClick={() => reintentar(l)} disabled={ocupada === l.id}>
                          {ocupada === l.id ? "..." : "Reintentar"}
                        </button>
                        <button
                          type="button"
                          className="boton-chico boton-secundario"
                          onClick={() => descartar(l)}
                          disabled={ocupada === l.id}
                        >
                          Descartar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
                {abierta === claveFila(l) && (
                  <tr className="fila-detalle">
                    <td colSpan={8}>
                      <DetalleLiquidacion
                        liquidacion={detalle && claveFila(detalle) === claveFila(l) ? detalle : null}
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
  if (l.tipo === "qr") return <DetalleQrSinPagar qr={l} />;
  const datos: [string, React.ReactNode][] = [
    ["Alias", <Copiable texto={l.alias} />],
    ["Generado por", l.generado_por || "—"],
    ["Banco", BANCOS[l.banco] ?? (l.banco || "—")],
    ["N° de orden", l.numero_orden_originante ? <Copiable texto={l.numero_orden_originante} /> : "—"],
    ["Pagador", l.pagador || "—"],
    ["Documento del pagador", l.documento_pagador || "—"],
    ["QR creado", fechaHora(l.creado_en ?? null)],
    ["Pagado", fechaHora(l.fecha_pago)],
    ["Facturado", l.estado === "facturado" ? fechaHora(l.procesado_en) : "—"],
    ["Intentos de facturación", String(l.intentos)],
    ["Glosa", l.glosa || "—"],
  ];
  if (l.cajero) {
    datos.splice(2, 0, ["Cajero automático", l.cajero.pantalla], ["Cliente", l.cajero.nombre_cliente || "—"]);
    if (l.cajero.nro_factura) datos.push(["N° de factura", <Copiable texto={l.cajero.nro_factura} />]);
  }
  return (
    <div className="detalle-liquidacion">
      <div>
        <dl className="datos-liquidacion">
          {datos.map(([nombre, valor]) => (
            <div key={nombre}>
              <dt>{nombre}</dt>
              <dd>{valor}</dd>
            </div>
          ))}
        </dl>
        {l.descripcion && <p className="descripcion-liquidacion">{l.descripcion}</p>}
        {l.error && <p className="mensaje-error">{l.error}</p>}
        <p className="datos-liquidacion__titulo">Comprobantes pagados</p>
        <TablaComprobantes detalle={l.detalle} />
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

function TablaComprobantes({ detalle }: { detalle: Liquidacion["detalle"] }) {
  return (
    <table className="tabla tabla--compacta">
      <tbody>
        {(detalle ?? []).map((item, i) => (
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
  );
}

// QR generado que no se pagó: no hay pago, pagador, factura ni transacción que mostrar.
function DetalleQrSinPagar({ qr }: { qr: Liquidacion }) {
  const datos: [string, React.ReactNode][] = [
    ["Alias", <Copiable texto={qr.alias} />],
    ["Generado por", qr.generado_por || "—"],
    ["Banco", BANCOS[qr.banco] ?? (qr.banco || "—")],
    ["QR creado", fechaHora(qr.creado_en ?? null)],
    ["Vence", fechaHora(qr.vence_en ?? null)],
    ["Estado", ETIQUETAS_ESTADO[qr.estado] ?? qr.estado],
    ["Glosa", qr.glosa || "—"],
  ];
  return (
    <div>
      <dl className="datos-liquidacion">
        {datos.map(([nombre, valor]) => (
          <div key={nombre}>
            <dt>{nombre}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
      </dl>
      {qr.descripcion && <p className="descripcion-liquidacion">{qr.descripcion}</p>}
      {qr.observacion && <p className="detalle-fecha">{qr.observacion}</p>}
      {(qr.detalle ?? []).length > 0 && (
        <>
          <p className="datos-liquidacion__titulo">Comprobantes del QR</p>
          <TablaComprobantes detalle={qr.detalle} />
        </>
      )}
    </div>
  );
}
