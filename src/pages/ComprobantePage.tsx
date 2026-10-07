import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { obtenerCobroEfectivo, obtenerTransaccion } from "../api/cobranza";
import { ApiError } from "../api/client";
import type { CobroEfectivo, TransaccionQR } from "../api/types";
import { aCentavos, formatoBs } from "../utils/dinero";

type Tipo = "qr" | "efectivo";

function esTipoValido(valor: string | undefined): valor is Tipo {
  return valor === "qr" || valor === "efectivo";
}

export function ComprobantePage() {
  const { tipo, id } = useParams<{ tipo: string; id: string }>();
  const [datos, setDatos] = useState<TransaccionQR | CobroEfectivo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!id || !esTipoValido(tipo)) {
      setError("Comprobante no válido.");
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(null);
    const promesa = tipo === "efectivo" ? obtenerCobroEfectivo(Number(id)) : obtenerTransaccion(Number(id));
    promesa
      .then(setDatos)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar el comprobante."))
      .finally(() => setCargando(false));
  }, [tipo, id]);

  if (cargando) return <p className="pagina">Cargando...</p>;
  if (error || !datos) return <p className="pagina mensaje-error">{error ?? "Comprobante no encontrado."}</p>;

  const esEfectivo = tipo === "efectivo";
  const cobro = datos as CobroEfectivo;
  const transaccion = datos as TransaccionQR;

  if (!esEfectivo && transaccion.estado !== "pagado") {
    return (
      <p className="pagina mensaje-error">
        Este QR todavía no fue pagado (estado: {transaccion.estado}) — el comprobante solo está
        disponible para cobros ya confirmados.
      </p>
    );
  }

  const numeroInterno = esEfectivo ? `COMP-EF-${cobro.id}` : `COMP-QR-${transaccion.id}`;
  const fecha = new Date(datos.creado_en).toLocaleString("es-BO");
  const cliente = datos.deuda.cliente;
  const montoCobrado = esEfectivo ? cobro.monto_snapshot : transaccion.monto_snapshot;
  const esAdelanto = Number(montoCobrado) < Number(datos.deuda.monto);

  return (
    <div className="pagina comprobante">
      <div className="comprobante__solo-pantalla acciones">
        <button onClick={() => window.print()}>Imprimir comprobante</button>
      </div>

      <div className="tarjeta comprobante__hoja">
        <h1>Cobranza CESSA</h1>
        <p className="detalle-fecha">Comprobante interno de cobro — sin valor fiscal</p>

        <table className="comprobante__tabla">
          <tbody>
            <tr>
              <td>N° interno</td>
              <td>{numeroInterno}</td>
            </tr>
            <tr>
              <td>Fecha y hora</td>
              <td>{fecha}</td>
            </tr>
            <tr>
              <td>Cliente</td>
              <td>{cliente.nombre}</td>
            </tr>
            <tr>
              <td>Código de cliente</td>
              <td>{cliente.codigo_externo}</td>
            </tr>
            <tr>
              <td>Forma de pago</td>
              <td>{esEfectivo ? "Efectivo" : "QR (MC4/SIP)"}</td>
            </tr>
            <tr>
              <td>Cajero/a</td>
              <td>{datos.usuario}</td>
            </tr>
            {esEfectivo && (
              <>
                <tr>
                  <td>Monto recibido</td>
                  <td>Bs. {formatoBs(aCentavos(cobro.monto_recibido))}</td>
                </tr>
                <tr>
                  <td>Vuelto</td>
                  <td>Bs. {formatoBs(aCentavos(cobro.vuelto))}</td>
                </tr>
              </>
            )}
            {esAdelanto && (
              <tr>
                <td>Deuda total consultada</td>
                <td>Bs. {formatoBs(aCentavos(datos.deuda.monto))}</td>
              </tr>
            )}
          </tbody>
        </table>

        {datos.items_cobrados?.length > 0 && (
          <table className="comprobante__tabla comprobante__items">
            <tbody>
              {datos.items_cobrados.map((item, i) => (
                <tr key={`${item.nro_comprobante}-${i}`}>
                  <td>
                    {item.detalle} <span className="detalle-fecha">N° {item.nro_comprobante}</span>
                  </td>
                  <td className="num">{formatoBs(aCentavos(item.importe))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="monto">Cobrado: Bs. {formatoBs(aCentavos(montoCobrado))}</p>
        {esAdelanto && (
          <p className="detalle-fecha">
            Pago parcial — queda pendiente Bs. {formatoBs(aCentavos(datos.deuda.monto) - aCentavos(montoCobrado))}
          </p>
        )}
        <p className="detalle-fecha">
          Factura: {datos.factura?.numero_factura || datos.factura?.estado_envio || "no generada"}
        </p>
      </div>
    </div>
  );
}
