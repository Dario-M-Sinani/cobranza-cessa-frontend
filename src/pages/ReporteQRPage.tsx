import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { detalleQR, totalesQRPorDia, type DiaQR, type FilaQR, type FiltrosQR, type ResumenQR } from "../api/cobranza";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { aCentavos, formatoBs } from "../utils/dinero";
import { fechaISO, hora } from "../utils/fechas";
import { ETIQUETAS_ESTADO_QR as ETIQUETAS_ESTADO } from "../utils/qr";

type Dias = { desde: string; hasta: string; dias: DiaQR[]; totales: Omit<DiaQR, "dia"> };
type Detalle = ResumenQR & { desde: string; hasta: string; resultados: FilaQR[] };

function fechaHora(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${hora(iso)}`;
}

/**
 * Reportes de QR para imprimir o guardar en PDF desde el navegador (Ctrl+P → "Guardar como PDF"),
 * como "Reporte" y "Detalle" de la lista de QR de la app Java. Usa los mismos filtros de la lista.
 */
export function ReporteQRPage() {
  const { tipo } = useParams<{ tipo: string }>();
  const [params] = useSearchParams();
  const { sesion } = useAuth();
  const [dias, setDias] = useState<Dias | null>(null);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const consulta = params.toString();
  const esDetalle = tipo === "detalle";

  useEffect(() => {
    const filtros = Object.fromEntries(new URLSearchParams(consulta)) as unknown as FiltrosQR;
    const promesa = esDetalle ? detalleQR(filtros).then(setDetalle) : totalesQRPorDia(filtros).then(setDias);
    promesa.catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo armar el reporte."));
  }, [consulta, esDetalle]);

  const datos = esDetalle ? detalle : dias;
  const filtrosTexto = [
    params.get("estado") && `Estado: ${ETIQUETAS_ESTADO[params.get("estado") ?? ""] ?? params.get("estado")}`,
    params.get("cajero") && `Cajero: ${params.get("cajero")}`,
    params.get("clientes") && `Clientes: ${params.get("clientes")}`,
    params.get("qr") && `QR N° ${params.get("qr")}`,
  ].filter(Boolean);

  if (error) return <p className="pagina mensaje-error">{error}</p>;
  if (!datos) return <p className="pagina">Armando el reporte...</p>;

  return (
    <div className="pagina pagina--ancha reporte">
      <div className="reporte__barra comprobante__solo-pantalla">
        <button onClick={() => window.print()}>Imprimir / Guardar PDF</button>
        <span className="detalle-fecha">En la ventana de impresión elige "Guardar como PDF" para tener el archivo.</span>
      </div>

      <header className="reporte__encabezado">
        <img src="/logo-cessa.png" alt="CESSA" className="reporte__logo" />
        <div>
          <h1>{esDetalle ? "Detalle de pagos por QR" : "Pagos por QR: totales por día"}</h1>
          <p>
            Del {fechaISO(datos.desde)} al {fechaISO(datos.hasta)}
            {filtrosTexto.length > 0 && ` · ${filtrosTexto.join(" · ")}`}
          </p>
          <p className="detalle-fecha">
            Generado el {fechaHora(new Date().toISOString())} por {sesion?.username}
          </p>
        </div>
      </header>

      {dias && !esDetalle && (
        <table className="tabla reporte__tabla">
          <thead>
            <tr>
              <th>Día</th>
              <th className="num">Generados</th>
              <th className="num">Pagados</th>
              <th className="num">Monto pagado (Bs.)</th>
              <th className="num">Anulados</th>
              <th className="num">Vencidos</th>
              <th className="num">Con error</th>
              <th className="num">Sin pagar</th>
            </tr>
          </thead>
          <tbody>
            {dias.dias.map((d) => (
              <tr key={d.dia}>
                <td>{fechaISO(d.dia)}</td>
                <td className="num">{d.generados}</td>
                <td className="num">{d.pagados}</td>
                <td className="num">{formatoBs(aCentavos(d.monto_pagado))}</td>
                <td className="num">{d.anulados}</td>
                <td className="num">{d.vencidos}</td>
                <td className="num">{d.con_error}</td>
                <td className="num">{d.pendientes}</td>
              </tr>
            ))}
            {dias.dias.length === 0 && (
              <tr>
                <td colSpan={8}>Sin QR en esas fechas.</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <th>Total</th>
              <th className="num">{dias.totales.generados}</th>
              <th className="num">{dias.totales.pagados}</th>
              <th className="num">{formatoBs(aCentavos(dias.totales.monto_pagado))}</th>
              <th className="num">{dias.totales.anulados}</th>
              <th className="num">{dias.totales.vencidos}</th>
              <th className="num">{dias.totales.con_error}</th>
              <th className="num">{dias.totales.pendientes}</th>
            </tr>
          </tfoot>
        </table>
      )}

      {detalle && esDetalle && (
        <table className="tabla reporte__tabla">
          <thead>
            <tr>
              <th>#</th>
              <th>N° QR</th>
              <th>Generado</th>
              <th>Pagado</th>
              <th>Cliente</th>
              <th>Estado</th>
              <th>Cajero</th>
              <th>Factura</th>
              <th className="num">Monto (Bs.)</th>
            </tr>
          </thead>
          <tbody>
            {detalle.resultados.map((t, i) => (
              <tr key={t.id}>
                <td>{i + 1}</td>
                <td>{t.id}</td>
                <td className="sin-corte">{fechaHora(t.creado_en)}</td>
                <td className="sin-corte">{t.pagado_en ? fechaHora(t.pagado_en) : ""}</td>
                <td>
                  {t.cliente.codigo} · {t.cliente.nombre}
                </td>
                <td>{ETIQUETAS_ESTADO[t.estado] ?? t.estado_descripcion}</td>
                <td>{t.cajero}</td>
                <td>{t.factura}</td>
                <td className="num">{formatoBs(aCentavos(t.monto))}</td>
              </tr>
            ))}
            {detalle.resultados.length === 0 && (
              <tr>
                <td colSpan={9}>Sin QR con esos filtros.</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={8}>
                {detalle.total} QR · {detalle.pagados} pagados · total cobrado
              </th>
              <th className="num">{formatoBs(aCentavos(detalle.monto_pagado))}</th>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
