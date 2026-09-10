import { useEffect, useState, type FormEvent } from "react";
import {
  abrirCaja,
  abrirCajaParaCajero,
  cerrarCaja,
  listarAperturasFueraDeHorario,
  listarCajas,
  obtenerResumenCaja,
  reabrirCaja,
} from "../api/cobranza";
import { resetearPasswordCajero } from "../api/usuarios";
import { ApiError } from "../api/client";
import type { AperturaCajaFueraDeHorario, Caja, ResumenCaja } from "../api/types";
import { useAuth } from "../context/AuthContext";

const ETIQUETAS_ESTADO_CAJA: Record<string, string> = {
  abierta: "Abierta",
  cerrada: "Cerrada",
};

function formatearFecha(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-BO");
}

export function CajaPage() {
  const { sesion } = useAuth();
  const esSupervisorOAdmin = sesion?.rol === "supervisor" || sesion?.rol === "admin";

  const [cajas, setCajas] = useState<Caja[]>([]);
  const [aperturas, setAperturas] = useState<AperturaCajaFueraDeHorario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accionEnCurso, setAccionEnCurso] = useState<number | "nueva" | null>(null);
  const [motivosPorCaja, setMotivosPorCaja] = useState<Record<number, string>>({});
  const [cajeroIdParaAbrir, setCajeroIdParaAbrir] = useState("");
  const [motivoParaAbrir, setMotivoParaAbrir] = useState("");

  const [usernameParaReset, setUsernameParaReset] = useState("");
  const [passwordParaReset, setPasswordParaReset] = useState("");
  const [resetEnviando, setResetEnviando] = useState(false);
  const [resetConfirmado, setResetConfirmado] = useState(false);

  const [resumenCajaId, setResumenCajaId] = useState<number | null>(null);
  const [resumen, setResumen] = useState<ResumenCaja | null>(null);
  const [cargandoResumen, setCargandoResumen] = useState(false);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      setCajas(await listarCajas());
      if (esSupervisorOAdmin) {
        setAperturas(await listarAperturasFueraDeHorario());
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar la información de caja.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const miCajaAbierta = sesion?.rol === "cajera" ? cajas.find((c) => c.estado === "abierta") : undefined;

  async function onAbrirMiCaja() {
    setAccionEnCurso("nueva");
    setError(null);
    try {
      await abrirCaja();
      await cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo abrir la caja.");
    } finally {
      setAccionEnCurso(null);
    }
  }

  async function onVerResumen(id: number) {
    setResumenCajaId(id);
    setResumen(null);
    setCargandoResumen(true);
    setError(null);
    try {
      setResumen(await obtenerResumenCaja(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el resumen de la caja.");
    } finally {
      setCargandoResumen(false);
    }
  }

  async function onCerrar(id: number) {
    setAccionEnCurso(id);
    setError(null);
    try {
      await cerrarCaja(id);
      await cargar();
      // A propósito NO se muestra el corte acá: el total recaudado es
      // exclusivo de supervisor/admin (pedido del usuario 2026-09-07), el
      // cajero no debe verlo ni siquiera de su propio turno.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cerrar la caja.");
    } finally {
      setAccionEnCurso(null);
    }
  }

  async function onReabrir(id: number) {
    setAccionEnCurso(id);
    setError(null);
    try {
      await reabrirCaja(id, motivosPorCaja[id] ?? "");
      await cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo reabrir la caja.");
    } finally {
      setAccionEnCurso(null);
    }
  }

  async function onAbrirParaCajero(evento: FormEvent) {
    evento.preventDefault();
    const cajeroId = Number(cajeroIdParaAbrir);
    if (!cajeroId) return;

    setAccionEnCurso("nueva");
    setError(null);
    try {
      await abrirCajaParaCajero(cajeroId, motivoParaAbrir);
      setCajeroIdParaAbrir("");
      setMotivoParaAbrir("");
      await cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo abrir la caja.");
    } finally {
      setAccionEnCurso(null);
    }
  }

  async function onResetearPasswordCajero(evento: FormEvent) {
    evento.preventDefault();
    setResetEnviando(true);
    setResetConfirmado(false);
    setError(null);
    try {
      await resetearPasswordCajero(usernameParaReset, passwordParaReset);
      setUsernameParaReset("");
      setPasswordParaReset("");
      setResetConfirmado(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo resetear la contraseña.");
    } finally {
      setResetEnviando(false);
    }
  }

  return (
    <div className="pagina">
      <div className="pagina__encabezado">
        <h1>Caja</h1>
      </div>
      {error && <p className="mensaje-error">{error}</p>}

      {sesion?.rol === "cajera" && (
        <div className="tarjeta tarjeta--ancha">
          {miCajaAbierta ? (
            <>
              <p>
                Tu caja está <span className="estado estado--abierta">Abierta</span> desde{" "}
                {formatearFecha(miCajaAbierta.abierta_en)}.
              </p>
              <div className="acciones">
                <button disabled={accionEnCurso === miCajaAbierta.id} onClick={() => onCerrar(miCajaAbierta.id)}>
                  Cerrar caja
                </button>
              </div>
            </>
          ) : (
            <>
              <p>No tenés una caja abierta.</p>
              <button disabled={accionEnCurso === "nueva"} onClick={onAbrirMiCaja}>
                Abrir caja
              </button>
            </>
          )}
        </div>
      )}

      {esSupervisorOAdmin && resumenCajaId !== null && (
        <div className="tarjeta tarjeta--ancha">
          <h2 className="tarjeta__titulo">Corte de caja #{resumenCajaId}</h2>
          {cargandoResumen ? (
            <p>Cargando...</p>
          ) : (
            resumen && (
              <>
                <div className="tarjetas-resumen">
                  <div className="tarjeta stat">
                    <p className="stat__etiqueta">Total cobrado</p>
                    <p className="monto">Bs. {resumen.monto_total}</p>
                    <p className="detalle-fecha">{resumen.cantidad_cobros} cobros</p>
                  </div>
                  <div className="tarjeta stat">
                    <p className="stat__etiqueta">QR</p>
                    <p className="monto">Bs. {resumen.por_forma_pago.qr.monto}</p>
                    <p className="detalle-fecha">{resumen.por_forma_pago.qr.cantidad} cobros</p>
                  </div>
                  <div className="tarjeta stat">
                    <p className="stat__etiqueta">Efectivo</p>
                    <p className="monto">Bs. {resumen.por_forma_pago.efectivo.monto}</p>
                    <p className="detalle-fecha">{resumen.por_forma_pago.efectivo.cantidad} cobros</p>
                  </div>
                  <div className="tarjeta stat">
                    <p className="stat__etiqueta">Facturas registradas</p>
                    <p className="monto">{resumen.facturas_registradas}</p>
                  </div>
                </div>
                {resumen.qr_pendientes_de_confirmar > 0 && (
                  <p className="mensaje-error">
                    {resumen.qr_pendientes_de_confirmar} QR generado(s) en este turno todavía sin confirmar.
                  </p>
                )}
              </>
            )
          )}
          <button onClick={() => setResumenCajaId(null)}>Cerrar resumen</button>
        </div>
      )}

      {esSupervisorOAdmin && (
        <div className="tarjeta tarjeta--ancha">
          <h2 className="tarjeta__titulo">Abrir caja de un cajero (fuera de horario u otro caso)</h2>
          <form className="formulario-inline" onSubmit={onAbrirParaCajero}>
            <input
              type="number"
              placeholder="ID de cajero"
              value={cajeroIdParaAbrir}
              onChange={(evento) => setCajeroIdParaAbrir(evento.target.value)}
            />
            <input
              type="text"
              placeholder="Motivo (obligatorio si es fuera de horario)"
              value={motivoParaAbrir}
              onChange={(evento) => setMotivoParaAbrir(evento.target.value)}
            />
            <button type="submit" disabled={accionEnCurso === "nueva"}>
              Abrir
            </button>
          </form>
        </div>
      )}

      {esSupervisorOAdmin && (
        <div className="tarjeta tarjeta--ancha">
          <h2 className="tarjeta__titulo">Resetear contraseña de un cajero</h2>
          <form className="formulario-inline" onSubmit={onResetearPasswordCajero}>
            <input
              type="text"
              placeholder="Usuario del cajero"
              value={usernameParaReset}
              onChange={(evento) => setUsernameParaReset(evento.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Nueva contraseña"
              value={passwordParaReset}
              onChange={(evento) => setPasswordParaReset(evento.target.value)}
              minLength={8}
              required
            />
            <button type="submit" disabled={resetEnviando}>
              {resetEnviando ? "Guardando..." : "Resetear"}
            </button>
            {resetConfirmado && <span className="detalle-fecha">Actualizada</span>}
          </form>
        </div>
      )}

      {cargando ? (
        <p>Cargando...</p>
      ) : (
        <>
          <table className="tabla">
            <thead>
              <tr>
                <th>#</th>
                <th>Cajero</th>
                <th>Estado</th>
                <th>Abierta</th>
                <th>Cerrada</th>
                {esSupervisorOAdmin && <th>Resumen</th>}
                {esSupervisorOAdmin && <th>Reapertura</th>}
              </tr>
            </thead>
            <tbody>
              {cajas.map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>{c.cajero}</td>
                  <td>
                    <span className={`estado estado--${c.estado}`}>{ETIQUETAS_ESTADO_CAJA[c.estado]}</span>
                  </td>
                  <td>
                    {formatearFecha(c.abierta_en)} · {c.abierta_por}
                  </td>
                  <td>
                    {c.cerrada_en ? `${formatearFecha(c.cerrada_en)} · ${c.cerrada_por}` : "—"}
                  </td>
                  {esSupervisorOAdmin && (
                    <td>
                      <button onClick={() => onVerResumen(c.id)}>Ver</button>
                    </td>
                  )}
                  {esSupervisorOAdmin && (
                    <td className="acciones">
                      {c.estado === "cerrada" && (
                        <>
                          <input
                            type="text"
                            placeholder="Motivo (si es fuera de horario)"
                            value={motivosPorCaja[c.id] ?? ""}
                            onChange={(evento) =>
                              setMotivosPorCaja((prev) => ({ ...prev, [c.id]: evento.target.value }))
                            }
                          />
                          <button disabled={accionEnCurso === c.id} onClick={() => onReabrir(c.id)}>
                            Reabrir
                          </button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {cajas.length === 0 && (
                <tr>
                  <td colSpan={esSupervisorOAdmin ? 7 : 5}>No hay cajas todavía.</td>
                </tr>
              )}
            </tbody>
          </table>

          {esSupervisorOAdmin && (
            <>
              <h2 className="seccion__titulo">Aperturas fuera de horario</h2>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Caja</th>
                    <th>Autorizado por</th>
                    <th>Motivo</th>
                    <th>Fecha y hora</th>
                  </tr>
                </thead>
                <tbody>
                  {aperturas.map((a) => (
                    <tr key={a.id}>
                      <td>#{a.caja}</td>
                      <td>{a.usuario}</td>
                      <td>{a.motivo}</td>
                      <td>{formatearFecha(a.creado_en)}</td>
                    </tr>
                  ))}
                  {aperturas.length === 0 && (
                    <tr>
                      <td colSpan={4}>No hubo aperturas fuera de horario.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </div>
  );
}
