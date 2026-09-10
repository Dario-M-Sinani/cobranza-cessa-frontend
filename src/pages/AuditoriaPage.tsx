import { useEffect, useState } from "react";
import { listarAuditoria } from "../api/auditoria";
import { ApiError } from "../api/client";
import type { LogAuditoria } from "../api/types";

export function AuditoriaPage() {
  const [logs, setLogs] = useState<LogAuditoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setCargando(true);
      setError(null);
      try {
        setLogs(await listarAuditoria());
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "No se pudo cargar la auditoría.");
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  return (
    <div className="pagina">
      <div className="pagina__encabezado">
        <h1>Auditoría</h1>
      </div>
      {error && <p className="mensaje-error">{error}</p>}
      {cargando ? (
        <p>Cargando...</p>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>Fecha y hora</th>
              <th>Usuario</th>
              <th>Acción</th>
              <th>Entidad afectada</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{new Date(log.creado_en).toLocaleString("es-BO")}</td>
                <td>{log.usuario ?? "(sistema)"}</td>
                <td>{log.accion}</td>
                <td>{log.entidad_afectada}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={4}>No hay registros de auditoría todavía.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
