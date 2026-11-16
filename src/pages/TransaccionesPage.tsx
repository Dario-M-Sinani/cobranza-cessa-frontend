import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  buscarQR,
  cancelarTransaccion,
  consultaQR,
  consultarEstadoQR,
  descargarTransaccionesCSV,
  exportarQRTxt,
  reintentarFacturacion,
  type FilaQR,
  type FiltrosQR,
  type ResumenQR,
} from "../api/cobranza";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { aCentavos, formatoBs } from "../utils/dinero";
import { hoyISO, hora } from "../utils/fechas";
import { ETIQUETAS_ESTADO_QR } from "../utils/qr";

const ETIQUETAS_ESTADO = ETIQUETAS_ESTADO_QR;

function filtrosIniciales(): FiltrosQR {
  return { desde: hoyISO(), hasta: hoyISO(), estado: "", cajero: "", clientes: "", qr: "" };
}

function diaCorto(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * QR del panel, como "Lista de QR" de la app Java: filtros por fechas, estado, cajero, clientes y
 * N° de QR; reporte por día y reporte detalle (páginas imprimibles: se guardan en PDF desde el
 * navegador) y exportación a TXT. La cajera ve solo los suyos.
 */
export function TransaccionesPage() {
  const { sesion } = useAuth();
  const esSupervisorOAdmin = sesion?.rol === "supervisor" || sesion?.rol === "admin";

  const [filtros, setFiltros] = useState<FiltrosQR>(filtrosIniciales);
  const [aplicados, setAplicados] = useState<FiltrosQR>(filtrosIniciales);
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<(ResumenQR & { pagina: number; paginas: number; resultados: FilaQR[] }) | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [accionEnCurso, setAccionEnCurso] = useState<number | null>(null);
  const [anulando, setAnulando] = useState<number | null>(null);
  const [descargando, setDescargando] = useState<"txt" | "csv" | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setDatos(await buscarQR(aplicados, pagina));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar la lista.");
    } finally {
      setCargando(false);
    }
  }, [aplicados, pagina]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function cambiar<K extends keyof FiltrosQR>(campo: K, valor: FiltrosQR[K]) {
    setFiltros((f) => ({ ...f, [campo]: valor }));
  }

  function onBuscar(evento: FormEvent) {
    evento.preventDefault();
    setAviso(null);
    setPagina(1);
    setAplicados({ ...filtros });
  }

  function onLimpiar() {
    setFiltros(filtrosIniciales());
    setAplicados(filtrosIniciales());
    setPagina(1);
    setAviso(null);
  }

  async function accion(id: number, hacer: () => Promise<unknown>, mensajeError: string, ok?: string) {
    setAccionEnCurso(id);
    setError(null);
    setAviso(null);
    try {
      await hacer();
      if (ok) setAviso(ok);
      await cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : mensajeError);
    } finally {
      setAccionEnCurso(null);
      setAnulando(null);
    }
  }

  async function onConsultar(t: FilaQR) {
    setAccionEnCurso(t.id);
    setError(null);
    setAviso(null);
    try {
      const nuevo = await consultarEstadoQR(t.id);
      setAviso(
        nuevo.estado === "pagado"
          ? `QR ${t.id}: el cliente ya pagó. Quedó como pagado y se factura.`
          : `QR ${t.id}: el banco todavía no informa el pago (${ETIQUETAS_ESTADO[nuevo.estado] ?? nuevo.estado}).`
      );
      await cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo consultar el pago.");
    } finally {
      setAccionEnCurso(null);
    }
  }

  async function descargar(tipo: "txt" | "csv") {
    setDescargando(tipo);
    setError(null);
    try {
      if (tipo === "txt") await exportarQRTxt(aplicados);
      else await descargarTransaccionesCSV();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo descargar el archivo.");
    } finally {
      setDescargando(null);
    }
  }

  const consulta = consultaQR(aplicados);

  return (
    <div className="pagina pagina--ancha">
      <div className="pagina__encabezado">
        <h1>Transacciones QR</h1>
        <div className="acciones">
          <Link className="boton-secundario" to={`/reportes-qr/dias?${consulta}`} target="_blank">
            Reporte por día
          </Link>
          <Link className="boton-secundario" to={`/reportes-qr/detalle?${consulta}`} target="_blank">
            Reporte detalle
          </Link>
          <button className="boton-secundario" onClick={() => descargar("txt")} disabled={descargando !== null}>
            {descargando === "txt" ? "Exportando..." : "Exportar TXT"}
          </button>
          {esSupervisorOAdmin && (
            <button className="boton-secundario" onClick={() => descargar("csv")} disabled={descargando !== null}>
              {descargando === "csv" ? "Descargando..." : "CSV (todo)"}
            </button>
          )}
        </div>
      </div>

      <form className="filtros" onSubmit={onBuscar}>
        <label>
          Desde <input type="date" value={filtros.desde} max={filtros.hasta} onChange={(e) => e.target.value && cambiar("desde", e.target.value)} />
        </label>
        <label>
          Hasta <input type="date" value={filtros.hasta} min={filtros.desde} onChange={(e) => e.target.value && cambiar("hasta", e.target.value)} />
        </label>
        <select value={filtros.estado} onChange={(e) => cambiar("estado", e.target.value)} aria-label="Estado">
          <option value="">Todos los estados</option>
          {Object.entries(ETIQUETAS_ESTADO).map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </select>
        {esSupervisorOAdmin && (
          <input placeholder="Cajero (usuario)" value={filtros.cajero} onChange={(e) => cambiar("cajero", e.target.value)} size={14} />
        )}
        <input
          placeholder="N° de cliente(s), separados por coma"
          value={filtros.clientes}
          onChange={(e) => cambiar("clientes", e.target.value.replace(/[^\d,\s]/g, ""))}
          size={28}
        />
        <input placeholder="N° de QR" inputMode="numeric" value={filtros.qr} onChange={(e) => cambiar("qr", e.target.value.replace(/\D/g, ""))} size={9} />
        <button type="submit">Buscar</button>
        <button type="button" className="boton-secundario" onClick={onLimpiar}>
          Limpiar
        </button>
      </form>

      {error && <p className="mensaje-error">{error}</p>}
      {aviso && <p className="mensaje-ok">{aviso}</p>}

      {cargando && !datos ? (
        <p>Cargando...</p>
      ) : (
        datos && (
          <>
            <p className="detalle-fecha">
              {datos.total === 1 ? "1 QR" : `${datos.total} QR`} · {datos.pagados === 1 ? "1 pagado" : `${datos.pagados} pagados`} · Bs.{" "}
              {formatoBs(aCentavos(datos.monto_pagado))} cobrados
            </p>
            <table className="tabla">
              <thead>
                <tr>
                  <th className="sin-corte">N° QR</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th className="num">Monto (Bs.)</th>
                  <th>Estado</th>
                  <th>Cajero</th>
                  <th>Factura</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {datos.resultados.map((t) => {
                  const esperando = t.estado === "generado" || t.estado === "pendiente_confirmacion";
                  return (
                    <tr key={t.id}>
                      <td>{t.id}</td>
                      <td className="sin-corte">
                        {diaCorto(t.creado_en)} {hora(t.creado_en)}
                        {t.pagado_en && <div className="detalle-fecha">pagó {hora(t.pagado_en)}</div>}
                      </td>
                      <td>
                        {t.cliente.nombre} <span className="detalle-fecha">{t.cliente.codigo}</span>
                      </td>
                      <td className="num">{formatoBs(aCentavos(t.monto))}</td>
                      <td>
                        <span className={`estado estado--${t.estado}`}>{ETIQUETAS_ESTADO[t.estado] ?? t.estado_descripcion}</span>
                      </td>
                      <td>{t.cajero}</td>
                      <td>{t.factura || "—"}</td>
                      <td>
                        {anulando === t.id ? (
                          <div className="acciones">
                            <span>¿Anular? El cliente ya no podrá pagarlo.</span>
                            <button
                              className="boton-peligro boton-chico"
                              disabled={accionEnCurso === t.id}
                              onClick={() => accion(t.id, () => cancelarTransaccion(t.id), "No se pudo anular el QR.", `QR ${t.id} anulado.`)}
                            >
                              Sí, anular
                            </button>
                            <button className="boton-secundario boton-chico" onClick={() => setAnulando(null)}>
                              Volver
                            </button>
                          </div>
                        ) : (
                          <div className="acciones">
                            {esperando && (
                              <>
                                <button
                                  className="boton-secundario boton-chico"
                                  disabled={accionEnCurso === t.id}
                                  onClick={() => onConsultar(t)}
                                  title="Pregunta al banco si el cliente ya pagó (como 'Notificar pago' de la app Java)"
                                >
                                  {accionEnCurso === t.id ? "Consultando..." : "Consultar pago"}
                                </button>
                                <button className="boton-secundario boton-chico boton-anular" onClick={() => setAnulando(t.id)}>
                                  Anular
                                </button>
                              </>
                            )}
                            {esSupervisorOAdmin && t.factura_pendiente && (
                              <button
                                className="boton-secundario boton-chico"
                                disabled={accionEnCurso === t.id}
                                onClick={() => accion(t.id, () => reintentarFacturacion(t.id), "No se pudo reintentar la facturación.")}
                              >
                                Reintentar factura
                              </button>
                            )}
                            {t.estado === "pagado" && (
                              <Link className="boton-secundario boton-chico" to={`/comprobante/qr/${t.id}`}>
                                Comprobante
                              </Link>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {datos.resultados.length === 0 && (
                  <tr>
                    <td colSpan={8}>No hay QR con esos filtros.</td>
                  </tr>
                )}
              </tbody>
            </table>
            {datos.paginas > 1 && (
              <div className="paginacion">
                <button className="boton-secundario boton-chico" disabled={pagina <= 1 || cargando} onClick={() => setPagina((p) => p - 1)}>
                  Anterior
                </button>
                <span>
                  Página {datos.pagina} de {datos.paginas}
                </span>
                <button
                  className="boton-secundario boton-chico"
                  disabled={pagina >= datos.paginas || cargando}
                  onClick={() => setPagina((p) => p + 1)}
                >
                  Siguiente
                </button>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
