import { Fragment, useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "../api/client";
import type { CajeroResumen } from "../api/cajeros";
import { aCentavos, formatoBs } from "../utils/dinero";
import { hoyISO } from "../utils/fechas";
import { Icono } from "./Icono";

interface TransaccionSiic {
  uuid: string;
  lote: number;
  caja_codigo: number;
  estado: "CREADA" | "EN_TRANSACCION" | "PAGADA" | "ANULADA" | "FALLIDA";
  total_pagado: string | null;
  fecha_creacion: string;
  fecha_pago: string | null;
  fecha_anulacion: string | null;
  origen: "" | "panel" | "web";
}

interface Detalle {
  items: { nro_cliente: string; nro_comprobante: string; detalle: string; debito_credito: string; importe: string }[];
}

const ORIGEN: Record<string, string> = { panel: "Panel", web: "Web / bot / kiosco", "": "Banco / app Java" };
const CLASE_ESTADO: Record<string, string> = { PAGADA: "estado--pagado", ANULADA: "estado--error", FALLIDA: "estado--error" };

function hora(fecha: string | null): string {
  return fecha ? fecha.slice(11, 16) : "";
}

function dia(fecha: string): string {
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
}

/**
 * Transacciones de un cajero en el SIIC (también de los bancos), como "Transacciones" de la app Java.
 * Supervisor/admin: ver el detalle y anular las del día que no son del panel ni pagos web.
 */
export function TransaccionesCajero({ cajero, onCerrar }: { cajero: CajeroResumen; onCerrar: () => void }) {
  const [desde, setDesde] = useState(hoyISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [filas, setFilas] = useState<TransaccionSiic[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [anulando, setAnulando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vigente = true;
    setFilas(null);
    apiFetch<{ transacciones: TransaccionSiic[] }>(`/cajeros/${cajero.id}/transacciones/?desde=${desde}&hasta=${hasta}`)
      .then((r) => vigente && setFilas(r.transacciones))
      .catch((err) => vigente && setError(err instanceof ApiError ? err.message : "No se pudieron leer las transacciones."));
    return () => {
      vigente = false;
    };
  }, [cajero.id, desde, hasta, recarga]);

  async function verDetalle(uuid: string) {
    if (abierta === uuid) {
      setAbierta(null);
      return;
    }
    setAbierta(uuid);
    setDetalle(null);
    try {
      setDetalle(await apiFetch<Detalle>(`/transacciones-siic/${uuid}/`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo leer el detalle.");
    }
  }

  async function onAnular(evento: FormEvent, t: TransaccionSiic) {
    evento.preventDefault();
    setError(null);
    try {
      await apiFetch(`/transacciones-siic/${t.uuid}/anular/`, { method: "POST", body: { motivo: motivo.trim() } });
      setAviso(`Lote ${t.lote} anulado en el SIIC.`);
      setAnulando(null);
      setMotivo("");
      setRecarga((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo anular.");
    }
  }

  const pagadas = (filas ?? []).filter((t) => t.estado === "PAGADA");
  const total = pagadas.reduce((s, t) => s + aCentavos(t.total_pagado ?? "0"), 0);
  const hoy = hoyISO();

  return (
    <section className="tarjeta tarjeta--ancha">
      <h2 className="tarjeta__titulo">
        <Icono nombre="documento" /> Transacciones de {cajero.username} · {cajero.nombre}
      </h2>
      <div className="filtros">
        <label>
          Desde <input type="date" value={desde} max={hasta} onChange={(e) => e.target.value && setDesde(e.target.value)} />
        </label>
        <label>
          Hasta <input type="date" value={hasta} min={desde} max={hoy} onChange={(e) => e.target.value && setHasta(e.target.value)} />
        </label>
        <button type="button" className="boton-secundario" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
      {error && <p className="mensaje-error">{error}</p>}
      {aviso && <p className="mensaje-ok">{aviso}</p>}
      {filas === null ? (
        <p className="detalle-fecha">Cargando...</p>
      ) : (
        <>
          <p className="detalle-fecha">
            {pagadas.length === 1 ? "1 pagada" : `${pagadas.length} pagadas`} · Bs. {formatoBs(total)}
            {filas.length > pagadas.length ? ` · ${filas.length - pagadas.length} anuladas o sin pagar` : ""}
          </p>
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Lote</th>
                <th>Caja</th>
                <th>Origen</th>
                <th>Estado</th>
                <th className="num">Monto (Bs.)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((t) => {
                const sePuedeAnular = t.estado === "PAGADA" && t.origen === "" && t.fecha_creacion.slice(0, 10) === hoy;
                return (
                  <Fragment key={t.uuid}>
                    <tr className={t.estado === "ANULADA" ? "fila--anulada" : undefined}>
                      <td className="sin-corte">
                        {dia(t.fecha_creacion)} {hora(t.fecha_pago ?? t.fecha_creacion)}
                      </td>
                      <td>{t.lote}</td>
                      <td>{t.caja_codigo}</td>
                      <td>{ORIGEN[t.origen]}</td>
                      <td>
                        <span className={`estado ${CLASE_ESTADO[t.estado] ?? ""}`}>{t.estado.replace("_", " ").toLowerCase()}</span>
                      </td>
                      <td className="num">
                        <span className={t.estado === "ANULADA" ? "tachado" : undefined}>{formatoBs(aCentavos(t.total_pagado ?? "0"))}</span>
                      </td>
                      <td>
                        <div className="acciones">
                          <button className="boton-secundario boton-chico" onClick={() => verDetalle(t.uuid)}>
                            {abierta === t.uuid ? "Ocultar" : "Detalle"}
                          </button>
                          {sePuedeAnular && (
                            <button className="boton-secundario boton-chico boton-anular" onClick={() => setAnulando(t.uuid)}>
                              Anular
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {abierta === t.uuid && (
                      <tr className="fila--detalle">
                        <td colSpan={7}>
                          {detalle === null ? (
                            "Cargando..."
                          ) : (
                            <table className="comprobante__tabla">
                              <tbody>
                                {detalle.items.map((i) => (
                                  <tr key={`${i.nro_cliente}-${i.nro_comprobante}`}>
                                    <td>{i.nro_cliente}</td>
                                    <td>{i.nro_comprobante}</td>
                                    <td>{i.detalle}</td>
                                    <td className="num">
                                      {i.debito_credito === "CREDITO" ? "-" : ""}
                                      {formatoBs(aCentavos(i.importe))}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                    {anulando === t.uuid && (
                      <tr className="fila--detalle">
                        <td colSpan={7}>
                          <form className="anular" onSubmit={(e) => onAnular(e, t)}>
                            <span>
                              Anular el lote <strong>{t.lote}</strong> (Bs. {formatoBs(aCentavos(t.total_pagado ?? "0"))}) en el SIIC.
                              La deuda vuelve a quedar pendiente.
                            </span>
                            <input
                              required
                              minLength={5}
                              autoFocus
                              placeholder="Motivo (obligatorio)"
                              value={motivo}
                              onChange={(e) => setMotivo(e.target.value)}
                            />
                            <button type="submit" className="boton-peligro" disabled={motivo.trim().length < 5}>
                              Anular
                            </button>
                            <button type="button" className="boton-secundario" onClick={() => setAnulando(null)}>
                              Cancelar
                            </button>
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={7} className="detalle-fecha">
                    Sin transacciones en esas fechas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
