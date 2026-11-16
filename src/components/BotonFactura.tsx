import { useState } from "react";
import { apiFetchBlob, ApiError } from "../api/client";

/**
 * Abre la factura del SIIC (PDF) para imprimirla y entregarla al cliente, como la app Java al cobrar.
 * Si todavía no se registró en el SIIC, el backend la registra en el momento. Con varios clientes
 * (cobro agrupado) abre una por cliente.
 *
 * La pestaña se abre en el clic (vacía) y después se le carga el PDF: si se abriera recién al llegar
 * la respuesta, el navegador la bloquearía como ventana emergente.
 */
export function BotonFactura({
  facturasIds,
  chico = false,
  etiqueta,
}: {
  facturasIds: number[];
  chico?: boolean;
  etiqueta?: string;
}) {
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (facturasIds.length === 0) return null;

  async function abrir() {
    setError(null);
    setAbriendo(true);
    const ventanas = facturasIds.map(() => window.open("", "_blank"));
    try {
      for (const [i, id] of facturasIds.entries()) {
        const pdf = await apiFetchBlob(`/facturas/${id}/comprobante/`);
        const url = URL.createObjectURL(pdf);
        const ventana = ventanas[i];
        if (ventana) ventana.location.href = url;
        else window.open(url, "_blank");
      }
    } catch (err) {
      ventanas.forEach((v) => v?.close());
      setError(err instanceof ApiError ? err.message : "No se pudo abrir la factura.");
    } finally {
      setAbriendo(false);
    }
  }

  const texto = etiqueta ?? (facturasIds.length > 1 ? `Imprimir facturas (${facturasIds.length})` : "Imprimir factura");
  return (
    <>
      <button className={`boton-secundario${chico ? " boton-chico" : ""}`} disabled={abriendo} onClick={abrir}>
        {abriendo ? "Abriendo..." : texto}
      </button>
      {error && <span className="mensaje-error boton-factura__error">{error}</span>}
    </>
  );
}
