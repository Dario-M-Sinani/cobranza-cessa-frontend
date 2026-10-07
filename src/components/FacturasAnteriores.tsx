import { useEffect, useState } from "react";
import { listarFacturasPagadas, obtenerPdfFacturaPagada } from "../api/cobranza";
import { ApiError } from "../api/client";
import type { FacturaPagada } from "../api/types";
import { aCentavos, fechaCorta, formatoBs } from "../utils/dinero";

const VISIBLES = 12;

/**
 * Todas las facturas ya pagadas del cliente (por cualquier canal: caja, banco, QR), de la
 * más nueva a la más vieja, con su PDF para reimprimir. Se carga aparte de la deuda para
 * no demorar el cobro.
 */
export function FacturasAnteriores({ codigoCliente }: { codigoCliente: string }) {
  const [facturas, setFacturas] = useState<FacturaPagada[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verTodas, setVerTodas] = useState(false);
  const [abriendo, setAbriendo] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    listarFacturasPagadas(codigoCliente)
      .then((items) => vigente && setFacturas(items))
      .catch((err) => vigente && setError(err instanceof ApiError ? err.message : "No se pudieron cargar."));
    return () => {
      vigente = false;
    };
  }, [codigoCliente]);

  async function verPdf(factura: FacturaPagada) {
    // La pestaña se abre ya (con el clic) para que el navegador no la bloquee; el PDF llega después.
    const pestana = window.open("", "_blank");
    setAbriendo(factura.nro_comprobante);
    try {
      const blob = await obtenerPdfFacturaPagada(factura);
      const url = URL.createObjectURL(blob);
      if (pestana) pestana.location.assign(url);
      else window.location.assign(url);
    } catch (err) {
      pestana?.close();
      setError(err instanceof ApiError ? err.message : "No se pudo obtener el PDF.");
    } finally {
      setAbriendo(null);
    }
  }

  const visibles = facturas && !verTodas ? facturas.slice(0, VISIBLES) : facturas;

  return (
    <section className="facturas-anteriores">
      <h3 className="tarjeta__titulo">
        Facturas anteriores (pagadas){facturas ? ` · ${facturas.length}` : ""}
      </h3>
      {error && <p className="mensaje-error">{error}</p>}
      {!facturas && !error && <p className="detalle-fecha">Cargando...</p>}
      {facturas && facturas.length === 0 && <p className="detalle-fecha">No hay facturas pagadas registradas.</p>}
      {visibles && visibles.length > 0 && (
        <table className="tabla tabla--compacta">
          <thead>
            <tr>
              <th>Concepto</th>
              <th>Emisión</th>
              <th>Pagada</th>
              <th className="num">Importe (Bs.)</th>
              <th aria-label="Factura" />
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => (
              <tr key={`${f.tipo}-${f.nro_comprobante}-${f.fecha}`}>
                <td>
                  {f.detalle}
                  <span className="detalle-fecha"> · N° {f.nro_comprobante}</span>
                </td>
                <td>{fechaCorta(f.fecha)}</td>
                <td>
                  {fechaCorta(f.pago_fecha)} <span className="detalle-fecha">{f.pago_hora?.slice(0, 5)}</span>
                </td>
                <td className="num">{formatoBs(aCentavos(f.importe))}</td>
                <td className="num">
                  <button
                    type="button"
                    className="boton-chico"
                    onClick={() => verPdf(f)}
                    disabled={abriendo === f.nro_comprobante}
                  >
                    {abriendo === f.nro_comprobante ? "..." : "PDF"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {facturas && facturas.length > VISIBLES && (
        <button type="button" className="boton-secundario boton-chico" onClick={() => setVerTodas(!verTodas)}>
          {verTodas ? "Ver menos" : `Ver todas (${facturas.length})`}
        </button>
      )}
    </section>
  );
}
