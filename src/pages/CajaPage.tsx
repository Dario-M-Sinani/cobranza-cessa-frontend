import { useEffect, useState, type FormEvent } from "react";
import {
  abrirCaja,
  abrirCajaParaCajero,
  abrirReporteCierre,
  cerrarCaja,
  listarAperturasFueraDeHorario,
  listarAgenciasCaja,
  listarCajas,
  obtenerResumenCaja,
  reabrirCaja,
} from "../api/cobranza";
import { resetearPasswordCajero } from "../api/usuarios";
import { ApiError } from "../api/client";
import type { AgenciasCaja, AperturaCajaFueraDeHorario, Caja, ResumenCaja } from "../api/types";
import { aCentavos, formatoBs } from "../utils/dinero";
import { useAuth } from "../context/AuthContext";
import { CierreCaja } from "../components/CierreCaja";
import { Icono } from "../components/Icono";

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
  // Caja del SIIC (cajera de la Nest): agencia y efectivo con que empieza el turno.
  const [agencias, setAgencias] = useState<AgenciasCaja | null>(null);
  const [agenciaSigla, setAgenciaSigla] = useState("");
  const [montoInicial, setMontoInicial] = useState("");

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

  useEffect(() => {
    if (sesion?.rol !== "cajera" || !sesion.cajaSiic) return;
    listarAgenciasCaja()
      .then((datos) => {
        setAgencias(datos);
        if (datos.agencias.length === 1) setAgenciaSigla(datos.agencias[0].sigla);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudieron cargar las agencias."));
  }, [sesion?.rol, sesion?.cajaSiic]);

  const miCajaAbierta = sesion?.rol === "cajera" ? cajas.find((c) => c.estado === "abierta") : undefined;
  // El SIIC da una sola caja por día: si la de hoy ya se cerró, no se puede abrir otra.
  const hoy = new Date().toDateString();
  const cajaSiicCerradaHoy =
    sesion?.rol === "cajera" && sesion.cajaSiic && !miCajaAbierta
      ? cajas.find((c) => c.estado === "cerrada" && c.caja_codigo && new Date(c.creada_en).toDateString() === hoy)
      : undefined;

  async function onAbrirMiCaja(evento?: FormEvent) {
    evento?.preventDefault();
    setAccionEnCurso("nueva");
    setError(null);
    try {
      await abrirCaja(agenciaSigla, montoInicial.replace(",", "."));
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

      {sesion?.rol === "cajera" &&
        (miCajaAbierta ? (
          <section className="turno">
            <div className="turno__icono">
              <Icono nombre="caja" tamano={34} />
            </div>
            <div>
              <p className="turno__titulo">Tu caja de hoy</p>
              <p className="turno__numero">{miCajaAbierta.caja_codigo ? `Caja ${miCajaAbierta.caja_codigo}` : "Caja abierta"}</p>
              <div className="turno__datos">
                {miCajaAbierta.caja_codigo && (
                  <span>
                    <Icono nombre="agencia" tamano={16} />
                    {miCajaAbierta.agencia_descripcion || miCajaAbierta.agencia_sigla}
                  </span>
                )}
                <span>
                  <Icono nombre="reloj" tamano={16} />
                  Desde {formatearFecha(miCajaAbierta.abierta_en)}
                </span>
                {miCajaAbierta.caja_codigo && (
                  <span>
                    <Icono nombre="billete" tamano={16} />
                    Monto inicial Bs. {formatoBs(aCentavos(miCajaAbierta.monto_inicial))}
                  </span>
                )}
              </div>
            </div>
            <div className="turno__lado">
              <span className="turno__estado">Abierta</span>
              {/* Caja del SIIC: se cierra con arqueo (abajo). Caja solo local: como siempre. */}
              {!miCajaAbierta.caja_codigo && (
                <button disabled={accionEnCurso === miCajaAbierta.id} onClick={() => onCerrar(miCajaAbierta.id)}>
                  Cerrar caja
                </button>
              )}
            </div>
          </section>
        ) : cajaSiicCerradaHoy ? (
          <section className="turno turno--cerrada">
            <div className="turno__icono">
              <Icono nombre="candado" tamano={32} />
            </div>
            <div>
              <p className="turno__titulo">Tu caja de hoy</p>
              <p className="turno__numero">Caja {cajaSiicCerradaHoy.caja_codigo} cerrada</p>
              <div className="turno__datos">
                <span>
                  <Icono nombre="agencia" tamano={16} />
                  {cajaSiicCerradaHoy.agencia_descripcion || cajaSiicCerradaHoy.agencia_sigla}
                </span>
                <span>
                  <Icono nombre="reloj" tamano={16} />
                  Cerrada {formatearFecha(cajaSiicCerradaHoy.cerrada_en)}
                </span>
              </div>
              <p className="turno__nota">
                El SIIC no deja abrir otra caja el mismo día: mañana abres una nueva. Si hace falta seguir cobrando hoy,
                avisa a tu supervisora.
              </p>
            </div>
            <span className="turno__estado">Cerrada</span>
          </section>
        ) : (
          <section className="tarjeta tarjeta--ancha">
            <h2 className="tarjeta__titulo">
              <Icono nombre="caja" /> Abrir caja
            </h2>
            <p className="detalle-fecha">
              {sesion.cajaSiic
                ? "Elige la agencia donde vas a cobrar y el efectivo con el que empiezas (cambio). Con la caja abierta ya puedes cobrar."
                : "No tienes una caja abierta. Ábrela para empezar a cobrar."}
            </p>
            {sesion.cajaSiic ? (
              <form className="apertura" onSubmit={onAbrirMiCaja}>
                <label>
                  Agencia
                  <select required value={agenciaSigla} onChange={(e) => setAgenciaSigla(e.target.value)}>
                    <option value="">{agencias ? "Elige la agencia" : "Cargando..."}</option>
                    {agencias?.agencias.map((a) => (
                      <option key={a.sigla} value={a.sigla}>
                        {a.descripcion} ({a.sigla})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Monto inicial (Bs.)
                  <input
                    inputMode="decimal"
                    placeholder="0,00"
                    value={montoInicial}
                    onChange={(e) => setMontoInicial(e.target.value.replace(/[^0-9.,]/g, ""))}
                  />
                </label>
                <button type="submit" disabled={accionEnCurso === "nueva" || !agenciaSigla}>
                  {accionEnCurso === "nueva" ? "Abriendo..." : "Abrir caja"}
                </button>
              </form>
            ) : (
              <div className="acciones">
                <button disabled={accionEnCurso === "nueva"} onClick={() => onAbrirMiCaja()}>
                  Abrir caja
                </button>
              </div>
            )}
          </section>
        ))}

      {miCajaAbierta?.caja_codigo && <CierreCaja caja={miCajaAbierta} onCerrada={cargar} />}

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
                {resumen.cierre_siic && (
                  <>
                    <h3 className="tarjeta__titulo">
                      <Icono nombre="balanza" /> Cierre en el SIIC
                    </h3>
                    <div className="tarjetas-resumen">
                      <div className="tarjeta stat">
                        <p className="stat__etiqueta">Recaudado (contable)</p>
                        <p className="monto">Bs. {formatoBs(aCentavos(resumen.cierre_siic.recaudado_bs))}</p>
                      </div>
                      <div className="tarjeta stat">
                        <p className="stat__etiqueta">Efectivo contado</p>
                        <p className="monto">Bs. {formatoBs(aCentavos(resumen.cierre_siic.efectivo_bs))}</p>
                      </div>
                      <div className="tarjeta stat">
                        <p className="stat__etiqueta">Cheques y otros valores</p>
                        <p className="monto">
                          Bs. {formatoBs(aCentavos(resumen.cierre_siic.cheques_bs) + aCentavos(resumen.cierre_siic.otros_valores))}
                        </p>
                      </div>
                      <div className={`tarjeta stat ${aCentavos(resumen.cierre_siic.diferencia_bs) === 0 ? "stat--ok" : "stat--alerta"}`}>
                        <p className="stat__etiqueta">Diferencia</p>
                        <p className={`monto ${aCentavos(resumen.cierre_siic.diferencia_bs) === 0 ? "" : "monto--alerta"}`}>
                          Bs. {formatoBs(aCentavos(resumen.cierre_siic.diferencia_bs))}
                        </p>
                      </div>
                    </div>
                    <button className="boton-secundario" onClick={() => abrirReporteCierre(resumenCajaId).catch((err) =>
                      setError(err instanceof ApiError ? err.message : "No se pudo abrir el reporte."))}>
                      Reporte de cierre (PDF)
                    </button>
                  </>
                )}
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
                <th>Caja SIIC</th>
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
                  <td title={c.agencia_descripcion}>{c.caja_codigo ? `${c.caja_codigo} · ${c.agencia_sigla}` : "—"}</td>
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
                      {c.estado === "cerrada" && c.caja_codigo && (
                        <span className="detalle-fecha" title="El SIIC no reabre una caja cerrada">
                          Cerrada en el SIIC
                        </span>
                      )}
                      {c.estado === "cerrada" && !c.caja_codigo && (
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
