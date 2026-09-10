import { useEffect, useState, type FormEvent } from "react";
import { obtenerResumenDashboard } from "../api/dashboard";
import { ApiError } from "../api/client";
import type { ResumenDashboard } from "../api/types";
import { useAuth } from "../context/AuthContext";

const ETIQUETAS_ESTADO_CAJA: Record<string, string> = {
  abierta: "Abierta",
  cerrada: "Cerrada",
};

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatearFecha(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-BO");
}

export function DashboardPage() {
  const { sesion } = useAuth();
  const esAdmin = sesion?.rol === "admin";

  const [desde, setDesde] = useState(hoyISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [resumen, setResumen] = useState<ResumenDashboard | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function cargar(desdeParam: string, hastaParam: string) {
    setCargando(true);
    setError(null);
    try {
      setResumen(await obtenerResumenDashboard(desdeParam, hastaParam));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el dashboard.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar(hoyISO(), hoyISO());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onFiltrar(evento: FormEvent) {
    evento.preventDefault();
    cargar(desde, hasta);
  }

  return (
    <div className="pagina">
      <div className="pagina__encabezado">
        <h1>Dashboard</h1>
      </div>

      {esAdmin && (
        <form className="formulario-inline" onSubmit={onFiltrar}>
          <label>
            Desde{" "}
            <input type="date" value={desde} onChange={(evento) => setDesde(evento.target.value)} />
          </label>
          <label>
            Hasta{" "}
            <input type="date" value={hasta} onChange={(evento) => setHasta(evento.target.value)} />
          </label>
          <button type="submit">Filtrar</button>
        </form>
      )}

      {error && <p className="mensaje-error">{error}</p>}

      {cargando ? (
        <p>Cargando...</p>
      ) : (
        resumen && (
          <>
            <div className="tarjetas-resumen">
              <div className="tarjeta stat">
                <p className="stat__etiqueta">Total cobrado</p>
                <p className="monto">Bs. {resumen.monto_total}</p>
                <p className="detalle-fecha">
                  {resumen.desde === resumen.hasta ? resumen.desde : `${resumen.desde} → ${resumen.hasta}`}
                </p>
              </div>
              <div className="tarjeta stat">
                <p className="stat__etiqueta">Cobros</p>
                <p className="monto">{resumen.cantidad_cobros}</p>
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

            <h2 className="seccion__titulo">Cajas del período</h2>
            <table className="tabla">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Cajero</th>
                  <th>Estado</th>
                  <th>Abierta</th>
                  <th>Cerrada</th>
                </tr>
              </thead>
              <tbody>
                {resumen.cajas.map((c) => (
                  <tr key={c.id}>
                    <td>{c.id}</td>
                    <td>{c.cajero}</td>
                    <td>
                      <span className={`estado estado--${c.estado}`}>{ETIQUETAS_ESTADO_CAJA[c.estado]}</span>
                    </td>
                    <td>{formatearFecha(c.abierta_en)}</td>
                    <td>{formatearFecha(c.cerrada_en)}</td>
                  </tr>
                ))}
                {resumen.cajas.length === 0 && (
                  <tr>
                    <td colSpan={5}>No hubo cajas en este período.</td>
                  </tr>
                )}
              </tbody>
            </table>

            {esAdmin && (
              <>
                <h2 className="seccion__titulo">Comparativa por cajero</h2>
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Cajero</th>
                      <th>Cobros</th>
                      <th>Monto total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.por_cajero.map((fila) => (
                      <tr key={fila.cajero}>
                        <td>{fila.cajero}</td>
                        <td>{fila.cantidad_cobros}</td>
                        <td>Bs. {fila.monto_total}</td>
                      </tr>
                    ))}
                    {resumen.por_cajero.length === 0 && (
                      <tr>
                        <td colSpan={3}>Sin cobros en este período.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </>
            )}
          </>
        )
      )}
    </div>
  );
}
