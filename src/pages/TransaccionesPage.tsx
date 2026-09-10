import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { cancelarTransaccion, descargarTransaccionesCSV, listarTransacciones, reintentarFacturacion } from "../api/cobranza";
import { ApiError } from "../api/client";
import type { TransaccionQR } from "../api/types";
import { useAuth } from "../context/AuthContext";

const ETIQUETAS_ESTADO: Record<string, string> = {
  generado: "Generado",
  pendiente_confirmacion: "Pendiente de confirmación",
  pagado: "Pagado",
  vencido: "Vencido",
  error: "Error",
  cancelado: "Cancelado",
};

export function TransaccionesPage() {
  const { sesion } = useAuth();
  const [transacciones, setTransacciones] = useState<TransaccionQR[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accionEnCurso, setAccionEnCurso] = useState<number | null>(null);
  const [descargando, setDescargando] = useState(false);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      setTransacciones(await listarTransacciones());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar la lista.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function onCancelar(id: number) {
    setAccionEnCurso(id);
    try {
      await cancelarTransaccion(id);
      await cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cancelar.");
    } finally {
      setAccionEnCurso(null);
    }
  }

  async function onReintentarFacturacion(id: number) {
    setAccionEnCurso(id);
    try {
      await reintentarFacturacion(id);
      await cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo reintentar la facturación.");
    } finally {
      setAccionEnCurso(null);
    }
  }

  const esSupervisorOAdmin = sesion?.rol === "supervisor" || sesion?.rol === "admin";
  const puedeReintentarFacturacion = esSupervisorOAdmin;

  async function onDescargarCSV() {
    setDescargando(true);
    setError(null);
    try {
      await descargarTransaccionesCSV();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo descargar el CSV.");
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div className="pagina">
      <div className="pagina__encabezado">
        <h1>Transacciones QR</h1>
        {esSupervisorOAdmin && (
          <button onClick={onDescargarCSV} disabled={descargando}>
            {descargando ? "Descargando..." : "Descargar CSV"}
          </button>
        )}
      </div>
      {error && <p className="mensaje-error">{error}</p>}
      {cargando ? (
        <p>Cargando...</p>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>#</th>
              <th>Cliente</th>
              <th>Monto</th>
              <th>Estado</th>
              <th>Cajera</th>
              <th>Factura</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {transacciones.map((t) => (
              <tr key={t.id}>
                <td>{t.id}</td>
                <td>{t.deuda.cliente.nombre}</td>
                <td>Bs. {t.monto_snapshot}</td>
                <td>
                  <span className={`estado estado--${t.estado}`}>{ETIQUETAS_ESTADO[t.estado]}</span>
                </td>
                <td>{t.usuario}</td>
                <td>{t.factura ? t.factura.numero_factura || t.factura.estado_envio : "—"}</td>
                <td className="acciones">
                  {(t.estado === "generado" || t.estado === "pendiente_confirmacion") && (
                    <button disabled={accionEnCurso === t.id} onClick={() => onCancelar(t.id)}>
                      Cancelar
                    </button>
                  )}
                  {puedeReintentarFacturacion && t.estado === "pagado" && (
                    <button disabled={accionEnCurso === t.id} onClick={() => onReintentarFacturacion(t.id)}>
                      Reintentar facturación
                    </button>
                  )}
                  {t.estado === "pagado" && <Link to={`/comprobante/qr/${t.id}`}>Ver comprobante</Link>}
                </td>
              </tr>
            ))}
            {transacciones.length === 0 && (
              <tr>
                <td colSpan={7}>No hay transacciones todavía.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
