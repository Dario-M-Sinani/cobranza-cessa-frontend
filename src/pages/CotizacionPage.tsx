import { useEffect, useState } from "react";
import {
  cambiarCotizacionSiic,
  historialCotizacionDolar,
  obtenerCotizacionDolar,
  releerCotizacionBcb,
  type CambioCotizacion,
  type CotizacionDolar,
} from "../api/cobranza";
import { ApiError } from "../api/client";
import { Icono } from "../components/Icono";
import { fechaISO, hoyISO } from "../utils/fechas";

function bs(valor: string | null): string {
  return valor === null ? "—" : Number(valor).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function cuando(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("es-BO")} ${d.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })}`;
}

function diferencia(c: CotizacionDolar): string {
  if (c.siic === null || c.bcb === null) return "—";
  const d = Number(c.siic) - Number(c.bcb);
  return Math.abs(d) < 0.005 ? "0" : (d > 0 ? "+" : "") + d.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function resumenCambio(c: CambioCotizacion): string {
  const quien = c.usuario ?? "automático (BCB)";
  const que = c.accion === "correccion" ? `Corregida de Bs ${bs(c.valor_anterior)} a ${bs(c.valor_nuevo)}` : `Cargada Bs ${bs(c.valor_nuevo)}`;
  return `${que} · ${quien} · ${cuando(c.creado_en)}`;
}

function primeroDelMes(): string {
  return `${hoyISO().slice(0, 8)}01`;
}

/**
 * Cotización del dólar para la supervisora: la del SIIC (la que usa el cierre de caja: manda) junto a
 * la oficial del BCB, con alertas, y el historial día por día como constancia.
 */
export function CotizacionPage() {
  const [hoy, setHoy] = useState<CotizacionDolar | null>(null);
  const [desde, setDesde] = useState(primeroDelMes());
  const [hasta, setHasta] = useState(hoyISO());
  const [dias, setDias] = useState<CotizacionDolar[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [releyendo, setReleyendo] = useState(false);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vigente = true;
    obtenerCotizacionDolar()
      .then((d) => vigente && setHoy(d))
      .catch((err) => vigente && setError(err instanceof ApiError ? err.message : "No se pudo leer la cotización."));
    return () => {
      vigente = false;
    };
  }, [recarga]);

  useEffect(() => {
    let vigente = true;
    historialCotizacionDolar(desde, hasta)
      .then((r) => vigente && setDias(r.dias))
      .catch((err) => vigente && setError(err instanceof ApiError ? err.message : "No se pudo leer el historial."));
    return () => {
      vigente = false;
    };
  }, [desde, hasta, recarga]);

  async function onReleer() {
    setReleyendo(true);
    setError(null);
    try {
      setHoy(await releerCotizacionBcb());
      setRecarga((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo volver a leer.");
    } finally {
      setReleyendo(false);
    }
  }

  function abrirCorreccion() {
    if (!hoy) return;
    setAviso(null);
    setValor(hoy.siic ?? hoy.bcb ?? "");
    setMotivo("");
    setCorrigiendo(true);
  }

  async function onGuardar(e: React.FormEvent) {
    e.preventDefault();
    if (!hoy) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await cambiarCotizacionSiic(hoy.fecha, valor, motivo);
      setHoy(r);
      setAviso(`Cotización del SIIC de hoy: Bs ${bs(r.siic)}. Quedó registrado.`);
      setCorrigiendo(false);
      setRecarga((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar la cotización en el SIIC.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="pagina pagina--ancha">
      <div className="pagina__encabezado">
        <h1>Cotización del dólar</h1>
        <button className="boton-secundario" onClick={onReleer} disabled={releyendo}>
          {releyendo ? "Leyendo..." : "Volver a leer ahora"}
        </button>
      </div>
      <p className="detalle-fecha">
        La del SIIC es la que vale: con ella se pasan a bolivianos los dólares al cerrar caja. La del Banco Central es la
        referencia oficial. Cada día queda registrado abajo como constancia.
      </p>
      {error && <p className="mensaje-error">{error}</p>}
      {aviso && <p className="aviso">{aviso}</p>}

      {hoy && (
        <>
          {hoy.alertas.map((a) => (
            <p key={a.tipo} className="aviso cotizacion__alerta">
              <Icono nombre="alerta" tamano={16} /> {a.mensaje}
            </p>
          ))}
          <div className="tarjetas-resumen">
            <div className={`tarjeta stat ${hoy.siic ? "stat--ok" : "stat--alerta"}`}>
              <p className="stat__etiqueta">SIIC hoy · {fechaISO(hoy.fecha)}</p>
              <p className="monto">{hoy.siic ? `Bs ${bs(hoy.siic)}` : "Sin cargar"}</p>
              <p className="detalle-fecha">
                {hoy.siic_error
                  ? `No se pudo consultar: ${hoy.siic_error}`
                  : hoy.siic_leida_en
                    ? `Leída ${cuando(hoy.siic_leida_en)}`
                    : "Entra con tu usuario del sistema de cobranzas para consultarla."}
              </p>
              {hoy.cambios[0] && <p className="detalle-fecha">{resumenCambio(hoy.cambios[0])}</p>}
              {!hoy.siic && hoy.carga_automatica && !hoy.carga_error && (
                <p className="detalle-fecha">Se carga sola con la del BCB en cuanto publique la vigencia de hoy.</p>
              )}
              {!corrigiendo && (
                <button className="boton-secundario boton-chico cotizacion__cargar" onClick={abrirCorreccion}>
                  {hoy.siic ? "Corregir" : "Cargar a mano"}
                </button>
              )}
              {corrigiendo && (
                <form className="cotizacion__confirmar" onSubmit={onGuardar}>
                  <label>
                    Cotización de hoy (Bs por $us)
                    <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} required autoFocus />
                  </label>
                  <label>
                    Motivo (queda registrado)
                    <input value={motivo} onChange={(e) => setMotivo(e.target.value)} minLength={5} maxLength={300} required />
                  </label>
                  <div className="acciones">
                    <button type="submit" disabled={guardando}>
                      {guardando ? "Guardando..." : "Guardar en el SIIC"}
                    </button>
                    <button type="button" className="boton-secundario" onClick={() => setCorrigiendo(false)} disabled={guardando}>
                      Cancelar
                    </button>
                  </div>
                </form>
              )}
            </div>
            <div className="tarjeta stat">
              <p className="stat__etiqueta">Oficial BCB</p>
              <p className="monto">{hoy.bcb ? `Bs ${bs(hoy.bcb)}` : "—"}</p>
              <p className="detalle-fecha">
                {hoy.bcb_error && !hoy.bcb
                  ? `No se pudo leer: ${hoy.bcb_error}`
                  : `${hoy.bcb_vigencia ? `Vigencia ${hoy.bcb_vigencia}` : ""}${hoy.bcb_fuente ? ` · fuente ${hoy.bcb_fuente}` : ""}`}
              </p>
            </div>
            <div className={`tarjeta stat ${hoy.alertas.some((a) => a.tipo === "diferencia") ? "stat--alerta" : ""}`}>
              <p className="stat__etiqueta">Diferencia SIIC − BCB</p>
              <p className="monto">{diferencia(hoy)}</p>
              <p className="detalle-fecha">Bs por dólar</p>
            </div>
          </div>
        </>
      )}

      <section className="tarjeta tarjeta--ancha">
        <h2 className="tarjeta__titulo">
          <Icono nombre="documento" /> Historial
        </h2>
        <div className="filtros">
          <label>
            Desde <input type="date" value={desde} max={hasta} onChange={(e) => e.target.value && setDesde(e.target.value)} />
          </label>
          <label>
            Hasta <input type="date" value={hasta} min={desde} max={hoyISO()} onChange={(e) => e.target.value && setHasta(e.target.value)} />
          </label>
        </div>
        {dias === null ? (
          <p className="detalle-fecha">Cargando...</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th className="num">SIIC (Bs)</th>
                <th className="num">BCB (Bs)</th>
                <th className="num">Diferencia</th>
                <th>Vigencia BCB</th>
                <th>Leída SIIC</th>
                <th>Leída BCB</th>
                <th>Cargada / corregida</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {dias.map((d) => (
                <tr key={d.fecha}>
                  <td className="sin-corte">{fechaISO(d.fecha)}</td>
                  <td className="num">{bs(d.siic)}</td>
                  <td className="num">{bs(d.bcb)}</td>
                  <td className="num">{diferencia(d)}</td>
                  <td>
                    {d.bcb_vigencia}
                    {d.bcb_fuente && <span className="detalle-fecha"> · {d.bcb_fuente}</span>}
                  </td>
                  <td className="sin-corte">{cuando(d.siic_leida_en)}</td>
                  <td className="sin-corte">{cuando(d.bcb_leida_en)}</td>
                  <td>{d.cambios[0] ? resumenCambio(d.cambios[0]) : <span className="detalle-fecha">—</span>}</td>
                  <td>
                    {d.alertas.length === 0 ? (
                      d.siic && d.bcb ? <span className="estado estado--pagado">Coinciden</span> : <span className="detalle-fecha">Incompleto</span>
                    ) : (
                      d.alertas.map((a) => (
                        <span key={a.tipo} className="estado estado--error" title={a.mensaje}>
                          {a.tipo === "sin_siic" ? "Sin cargar en SIIC" : a.tipo === "carga_fallida" ? "Carga automática falló" : "Distinta del BCB"}
                        </span>
                      ))
                    )}
                  </td>
                </tr>
              ))}
              {dias.length === 0 && (
                <tr>
                  <td colSpan={9}>Sin registros en esas fechas. Se registra un día cuando alguien entra al panel o con la lectura de cada hora.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>

      {dias && dias.some((d) => d.cambios.length > 0) && (
        <section className="tarjeta tarjeta--ancha">
          <h2 className="tarjeta__titulo">
            <Icono nombre="documento" /> Registro de cambios en el SIIC
          </h2>
          <table className="tabla">
            <thead>
              <tr>
                <th>Cuándo</th>
                <th>Día</th>
                <th>Qué</th>
                <th className="num">Antes</th>
                <th className="num">Ahora</th>
                <th>Quién</th>
                <th>Origen / motivo</th>
              </tr>
            </thead>
            <tbody>
              {dias
                .flatMap((d) => d.cambios)
                .sort((a, b) => b.creado_en.localeCompare(a.creado_en))
                .map((c) => (
                  <tr key={`${c.creado_en}-${c.fecha}`}>
                    <td className="sin-corte">{cuando(c.creado_en)}</td>
                    <td className="sin-corte">{fechaISO(c.fecha)}</td>
                    <td>{c.accion_texto}</td>
                    <td className="num">{bs(c.valor_anterior)}</td>
                    <td className="num">{bs(c.valor_nuevo)}</td>
                    <td>{c.usuario ?? "Automático"}</td>
                    <td>
                      {c.motivo || c.origen}
                      {c.tabla && <span className="detalle-fecha"> · {c.tabla}</span>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
