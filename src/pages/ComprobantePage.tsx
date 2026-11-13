import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  obtenerCobroAgrupado,
  obtenerCobroEfectivo,
  obtenerTransaccion,
  registrarImpresion,
  type TipoComprobante,
} from "../api/cobranza";
import { ApiError } from "../api/client";
import type { CobroAgrupado, CobroEfectivo, TransaccionQR } from "../api/types";
import { aCentavos, formatoBs } from "../utils/dinero";

type Tipo = "qr" | "efectivo";

function esTipoValido(valor: string | undefined): valor is Tipo {
  return valor === "qr" || valor === "efectivo";
}

function ComprobanteIndividual() {
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

  const impresion = useImpresion(
    tipo === "efectivo" ? "efectivo" : "qr",
    Number(id),
    !cargando && datos !== null && (tipo === "efectivo" || (datos as TransaccionQR).estado === "pagado")
  );

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
    <div className={`pagina comprobante${impresion.autorizado ? "" : " comprobante--bloqueado"}`}>
      <BarraImpresion impresion={impresion} />

      <div className="tarjeta comprobante__hoja">
        <h1>Cobranza CESSA</h1>
        <p className="detalle-fecha">Comprobante interno de cobro — sin valor fiscal</p>
        <MarcaReimpresion impresion={impresion} />

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

export function ComprobantePage() {
  const { tipo } = useParams<{ tipo: string }>();
  return tipo === "grupo" ? <ComprobanteGrupo /> : <ComprobanteIndividual />;
}

// Un pago en efectivo que cubrió a varios clientes: un solo comprobante con el detalle
// de cada uno, lo recibido y el vuelto.
function ComprobanteGrupo() {
  const { id } = useParams<{ id: string }>();
  const [grupo, setGrupo] = useState<CobroAgrupado | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerCobroAgrupado(Number(id))
      .then(setGrupo)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar el comprobante."));
  }, [id]);

  const impresion = useImpresion("grupo", Number(id), grupo !== null);

  if (error) return <p className="pagina mensaje-error">{error}</p>;
  if (!grupo) return <p className="pagina">Cargando...</p>;

  return (
    <div className={`pagina comprobante${impresion.autorizado ? "" : " comprobante--bloqueado"}`}>
      <BarraImpresion impresion={impresion} />

      <div className="tarjeta comprobante__hoja">
        <h1>Cobranza CESSA</h1>
        <p className="detalle-fecha">Comprobante interno de cobro — sin valor fiscal</p>
        <MarcaReimpresion impresion={impresion} />

        <table className="comprobante__tabla">
          <tbody>
            <tr>
              <td>N° interno</td>
              <td>COMP-GR-{grupo.id}</td>
            </tr>
            <tr>
              <td>Fecha y hora</td>
              <td>{new Date(grupo.creado_en).toLocaleString("es-BO")}</td>
            </tr>
            <tr>
              <td>Forma de pago</td>
              <td>Efectivo · {grupo.cobros.length} clientes</td>
            </tr>
            <tr>
              <td>Cajero/a</td>
              <td>{grupo.usuario}</td>
            </tr>
          </tbody>
        </table>

        {grupo.cobros.map((c) => (
          <div key={c.id} className="comprobante__cliente">
            <p>
              <strong>{c.deuda.cliente.nombre}</strong>{" "}
              <span className="detalle-fecha">Cliente {c.deuda.cliente.codigo_externo}</span>
            </p>
            <table className="comprobante__tabla comprobante__items">
              <tbody>
                {(c.items_cobrados ?? []).map((item, i) => (
                  <tr key={`${item.nro_comprobante}-${i}`}>
                    <td>
                      {item.detalle} <span className="detalle-fecha">N° {item.nro_comprobante}</span>
                    </td>
                    <td className="num">{formatoBs(aCentavos(item.importe))}</td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <strong>Subtotal</strong>
                    <span className="detalle-fecha"> · factura {c.factura?.numero_factura || c.factura?.estado_envio || "pendiente"}</span>
                  </td>
                  <td className="num">
                    <strong>{formatoBs(aCentavos(c.monto_snapshot))}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}

        <table className="comprobante__tabla">
          <tbody>
            <tr>
              <td>Total cobrado</td>
              <td className="num">Bs. {formatoBs(aCentavos(grupo.monto_total))}</td>
            </tr>
            <tr>
              <td>Recibido</td>
              <td className="num">Bs. {formatoBs(aCentavos(grupo.monto_recibido))}</td>
            </tr>
            <tr>
              <td>Vuelto</td>
              <td className="num">Bs. {formatoBs(aCentavos(grupo.vuelto))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface Impresion {
  imprimir: () => void;
  autorizado: boolean;
  esReimpresion: boolean;
  enCurso: boolean;
  error: string | null;
}

// Imprimir pasa siempre por el backend (POST /comprobantes/imprimir/): la cajera imprime cada
// comprobante una sola vez; reimprimir es de supervisor/admin y sale marcado. Sin ese permiso
// la hoja no se imprime (ni con Ctrl+P: ver .comprobante--bloqueado en App.css), y se vuelve
// a bloquear apenas termina cada impresión. Con `?imprimir=1` (al cobrar) imprime solo.
function useImpresion(tipo: TipoComprobante, id: number, listo: boolean): Impresion {
  const [parametros, setParametros] = useSearchParams();
  const pedido = parametros.get("imprimir") === "1";
  const [autorizado, setAutorizado] = useState(false);
  const [esReimpresion, setEsReimpresion] = useState(false);
  const [enCurso, setEnCurso] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const yaPedido = useRef(false);

  const imprimir = useCallback(async () => {
    setEnCurso(true);
    setError(null);
    try {
      const r = await registrarImpresion(tipo, id);
      setEsReimpresion(r.es_reimpresion);
      setAutorizado(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar la impresión.");
    } finally {
      setEnCurso(false);
    }
  }, [tipo, id]);

  // Recién con la hoja ya habilitada (y la marca de reimpresión dibujada) se abre el diálogo.
  useEffect(() => {
    if (!autorizado) return;
    const espera = setTimeout(() => window.print(), 100);
    return () => clearTimeout(espera);
  }, [autorizado]);

  useEffect(() => {
    const bloquear = () => setAutorizado(false);
    window.addEventListener("afterprint", bloquear);
    return () => window.removeEventListener("afterprint", bloquear);
  }, []);

  // El ref evita pedir dos impresiones por el doble efecto de StrictMode; el parámetro se saca
  // de la URL para que recargar la página no vuelva a pedir.
  useEffect(() => {
    if (!listo || !pedido || yaPedido.current) return;
    yaPedido.current = true;
    setParametros({}, { replace: true });
    imprimir();
  }, [listo, pedido, imprimir, setParametros]);

  return { imprimir, autorizado, esReimpresion, enCurso, error };
}

function BarraImpresion({ impresion }: { impresion: Impresion }) {
  return (
    <div className="comprobante__solo-pantalla acciones">
      <button onClick={impresion.imprimir} disabled={impresion.enCurso}>
        Imprimir comprobante
      </button>
      {impresion.error && <span className="mensaje-error">{impresion.error}</span>}
    </div>
  );
}

function MarcaReimpresion({ impresion }: { impresion: Impresion }) {
  return impresion.esReimpresion ? <p className="comprobante__reimpresion">REIMPRESIÓN</p> : null;
}
