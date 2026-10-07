import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { CobroEfectivo, Deuda, ItemDeuda, TransaccionQR } from "../api/types";
import { consultarDeuda, generarTransaccionQR, listarCajas, registrarCobroEfectivo } from "../api/cobranza";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import {
  aCentavos,
  aDecimal,
  desgloseVuelto,
  fechaCorta,
  formatoBs,
  sugerenciasDePago,
} from "../utils/dinero";

type Metodo = "efectivo" | "qr";

/**
 * Pantalla de cobro de la cajera: buscar cliente → elegir comprobantes →
 * cobrar en efectivo (con vuelto) o por QR → siguiente cliente.
 *
 * SIIC cobra comprobantes enteros y del más antiguo al más nuevo, y la deuda
 * ya llega en ese orden: la selección es siempre "los N primeros". Marcar uno
 * marca los anteriores; desmarcar uno desmarca los siguientes.
 */
export function ConsultaDeudaPage() {
  const { sesion } = useAuth();
  const navigate = useNavigate();
  const codigoInputRef = useRef<HTMLInputElement>(null);
  const recibidoInputRef = useRef<HTMLInputElement>(null);
  const siguienteRef = useRef<HTMLButtonElement>(null);

  const [codigoExterno, setCodigoExterno] = useState("");
  const [deuda, setDeuda] = useState<Deuda | null>(null);
  const [cantidad, setCantidad] = useState(0);
  const [metodo, setMetodo] = useState<Metodo>("efectivo");
  const [recibido, setRecibido] = useState("");
  const [transaccion, setTransaccion] = useState<TransaccionQR | null>(null);
  const [cobroEfectivo, setCobroEfectivo] = useState<CobroEfectivo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [sinCajaAbierta, setSinCajaAbierta] = useState(false);

  const esCajera = sesion?.rol === "cajera";

  useEffect(() => {
    if (!esCajera) return;
    listarCajas()
      .then((cajas) => setSinCajaAbierta(!cajas.some((c) => c.estado === "abierta")))
      .catch(() => setSinCajaAbierta(false));
  }, [esCajera]);

  const items: ItemDeuda[] = deuda?.items ?? [];
  const tieneItems = items.length > 0;

  const aCobrar = !deuda
    ? 0
    : tieneItems
      ? items.slice(0, cantidad).reduce((suma, item) => suma + aCentavos(item.importe), 0)
      : aCentavos(deuda.monto);

  const totalDeuda = aCentavos(deuda?.monto);
  const recibidoCentavos = aCentavos(recibido);
  const vuelto = recibidoCentavos - aCobrar;
  const cobraTodo = !tieneItems || cantidad === items.length;

  function nuevoCliente() {
    setCodigoExterno("");
    setDeuda(null);
    setCantidad(0);
    setRecibido("");
    setTransaccion(null);
    setCobroEfectivo(null);
    setError(null);
    codigoInputRef.current?.focus();
  }

  // Esc: siempre vuelve al buscador, listo para el próximo cliente.
  useEffect(() => {
    function alPresionar(e: KeyboardEvent) {
      if (e.key === "Escape") nuevoCliente();
    }
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, []);

  useEffect(() => {
    if (cobroEfectivo || transaccion) siguienteRef.current?.focus();
  }, [cobroEfectivo, transaccion]);

  async function onConsultar(e: FormEvent) {
    e.preventDefault();
    const codigo = codigoExterno.trim();
    if (!codigo) return;
    setError(null);
    setDeuda(null);
    setTransaccion(null);
    setCobroEfectivo(null);
    setCargando(true);
    try {
      const resultado = await consultarDeuda(codigo);
      setDeuda(resultado);
      // Por defecto se cobra todo y se asume pago exacto: el caso más común
      // no necesita tipear nada.
      setCantidad(resultado.items?.length ?? 0);
      setRecibido("");
      setMetodo("efectivo");
      setTimeout(() => recibidoInputRef.current?.focus(), 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo consultar la deuda.");
    } finally {
      setCargando(false);
    }
  }

  function alternarComprobante(indice: number) {
    // Marcado → desmarca ese y los siguientes. Sin marcar → marca hasta ese.
    setCantidad(indice < cantidad ? indice : indice + 1);
    setRecibido("");
  }

  async function onCobrarEfectivo(e?: FormEvent) {
    e?.preventDefault();
    if (!deuda || aCobrar <= 0) return;
    const montoRecibido = recibido === "" ? aCobrar : recibidoCentavos;
    if (montoRecibido < aCobrar) {
      setError(`Falta Bs. ${formatoBs(aCobrar - montoRecibido)} para cubrir el cobro.`);
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      const cobro = await registrarCobroEfectivo(
        deuda.id,
        aDecimal(montoRecibido),
        tieneItems && !cobraTodo ? cantidad : undefined,
      );
      setCobroEfectivo(cobro);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el cobro en efectivo.");
    } finally {
      setEnviando(false);
    }
  }

  async function onGenerarQR() {
    if (!deuda || aCobrar <= 0) return;
    setError(null);
    setEnviando(true);
    try {
      setTransaccion(await generarTransaccionQR(deuda.id, tieneItems && !cobraTodo ? cantidad : undefined));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo generar el QR.");
    } finally {
      setEnviando(false);
    }
  }

  const terminado = Boolean(cobroEfectivo || transaccion);

  return (
    <div className="pagina pagina--cobro">
      <div className="pagina__encabezado">
        <h1>Cobrar</h1>
        <span className="atajos">
          <kbd>Enter</kbd> buscar / cobrar · <kbd>Esc</kbd> nuevo cliente
        </span>
      </div>

      {esCajera && sinCajaAbierta && (
        <p className="aviso">
          No tienes una caja abierta: los cobros se registran igual, pero no entran en ningún cierre.{" "}
          <Link to="/caja">Abrir caja</Link>
        </p>
      )}

      <form className="buscador" onSubmit={onConsultar}>
        <input
          ref={codigoInputRef}
          inputMode="numeric"
          placeholder="Número de cliente"
          value={codigoExterno}
          onChange={(e) => setCodigoExterno(e.target.value)}
          autoFocus
          disabled={terminado}
        />
        <button type="submit" disabled={cargando || terminado}>
          {cargando ? "Buscando..." : "Buscar"}
        </button>
      </form>

      {error && <p className="mensaje-error">{error}</p>}

      {deuda && !terminado && (
        <div className="cobro">
          <section className="cobro__cliente tarjeta tarjeta--ancha">
            <div className="cliente-cabecera">
              <div>
                <h2>{deuda.cliente.nombre}</h2>
                <p className="detalle-fecha">
                  Cliente {deuda.cliente.codigo_externo}
                  {deuda.cliente.nit_ci ? ` · NIT/CI ${deuda.cliente.nit_ci}` : ""}
                </p>
              </div>
              <div className="cliente-cabecera__total">
                <span className="detalle-fecha">Deuda total</span>
                <strong>Bs. {formatoBs(totalDeuda)}</strong>
              </div>
            </div>

            {totalDeuda <= 0 ? (
              <p className="sin-deuda">Este cliente no tiene deuda pendiente.</p>
            ) : tieneItems ? (
              <>
                <table className="tabla tabla--comprobantes">
                  <thead>
                    <tr>
                      <th aria-label="Cobrar" />
                      <th>Concepto</th>
                      <th>Emisión</th>
                      <th>Vence</th>
                      <th className="num">Importe (Bs.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => {
                      const marcado = i < cantidad;
                      const credito = aCentavos(item.importe) < 0;
                      return (
                        <tr
                          key={`${item.tipo}-${item.nro_comprobante}-${i}`}
                          className={`${marcado ? "fila--marcada" : ""} ${credito ? "fila--credito" : ""}`}
                          onClick={() => esCajera && alternarComprobante(i)}
                        >
                          <td>
                            <input
                              type="checkbox"
                              checked={marcado}
                              disabled={!esCajera}
                              onChange={() => alternarComprobante(i)}
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`Cobrar ${item.detalle}`}
                            />
                          </td>
                          <td>
                            {item.detalle}
                            <span className="detalle-fecha"> · N° {item.nro_comprobante}</span>
                          </td>
                          <td>{fechaCorta(item.fecha)}</td>
                          <td>{fechaCorta(item.fecha_vencimiento)}</td>
                          <td className="num">{formatoBs(aCentavos(item.importe))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="detalle-fecha">
                  Se cobra del más antiguo al más nuevo: al marcar un comprobante se marcan los anteriores. Las
                  notas de crédito (en verde) restan.
                </p>
              </>
            ) : (
              <p className="detalle-fecha">Esta consulta no trae el detalle de comprobantes: se cobra el total.</p>
            )}
          </section>

          {totalDeuda > 0 && esCajera && (
            <section className="cobro__panel tarjeta">
              <div className="resumen-cobro">
                <span className="detalle-fecha">
                  A cobrar{tieneItems ? ` · ${cantidad} de ${items.length} comprobantes` : ""}
                </span>
                <strong className="monto monto--grande">Bs. {formatoBs(Math.max(aCobrar, 0))}</strong>
                {!cobraTodo && aCobrar > 0 && (
                  <span className="detalle-fecha">Queda pendiente Bs. {formatoBs(totalDeuda - aCobrar)}</span>
                )}
              </div>

              {aCobrar <= 0 ? (
                <p className="mensaje-error">
                  {cantidad === 0
                    ? "Marca al menos un comprobante."
                    : "Lo marcado suma Bs. 0 o menos por las notas de crédito: marca el siguiente."}
                </p>
              ) : (
                <>
                  <div className="pestanas" role="tablist">
                    <button
                      role="tab"
                      aria-selected={metodo === "efectivo"}
                      className={metodo === "efectivo" ? "pestana pestana--activa" : "pestana"}
                      onClick={() => setMetodo("efectivo")}
                    >
                      Efectivo
                    </button>
                    <button
                      role="tab"
                      aria-selected={metodo === "qr"}
                      className={metodo === "qr" ? "pestana pestana--activa" : "pestana"}
                      onClick={() => setMetodo("qr")}
                    >
                      QR
                    </button>
                  </div>

                  {metodo === "efectivo" ? (
                    <form className="efectivo" onSubmit={onCobrarEfectivo}>
                      <label>
                        Recibido (Bs.)
                        <input
                          ref={recibidoInputRef}
                          className="input-grande"
                          inputMode="decimal"
                          placeholder={aDecimal(aCobrar)}
                          value={recibido}
                          onChange={(e) => setRecibido(e.target.value)}
                        />
                      </label>
                      <div className="sugerencias">
                        {sugerenciasDePago(aCobrar).map((valor) => (
                          <button
                            type="button"
                            key={valor}
                            className={`chip ${recibido !== "" && recibidoCentavos === valor ? "chip--activo" : ""}`}
                            onClick={() => setRecibido(aDecimal(valor))}
                          >
                            {valor === aCobrar ? "Exacto" : `Bs. ${formatoBs(valor)}`}
                          </button>
                        ))}
                      </div>

                      <Vuelto vuelto={recibido === "" ? 0 : vuelto} />

                      <button
                        type="submit"
                        className="boton-principal"
                        disabled={enviando || (recibido !== "" && vuelto < 0)}
                      >
                        {enviando ? "Registrando..." : `Cobrar Bs. ${formatoBs(aCobrar)} en efectivo`}
                      </button>
                    </form>
                  ) : (
                    <div className="efectivo">
                      <p className="detalle-fecha">
                        Se genera un QR por Bs. {formatoBs(aCobrar)} para que el cliente pague desde su banco.
                      </p>
                      <button className="boton-principal" onClick={onGenerarQR} disabled={enviando}>
                        {enviando ? "Generando..." : `Generar QR por Bs. ${formatoBs(aCobrar)}`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </div>
      )}

      {cobroEfectivo && (
        <div className="tarjeta tarjeta-qr resultado">
          <p className="resultado__ok">Cobro registrado</p>
          <span className="detalle-fecha">Vuelto a entregar</span>
          <p className="monto monto--vuelto">Bs. {formatoBs(aCentavos(cobroEfectivo.vuelto))}</p>
          <DesgloseVuelto centavos={aCentavos(cobroEfectivo.vuelto)} />
          <p className="detalle-fecha">
            Cobrado Bs. {formatoBs(aCentavos(cobroEfectivo.monto_snapshot))} · Recibido Bs.{" "}
            {formatoBs(aCentavos(cobroEfectivo.monto_recibido))}
            {cobroEfectivo.items_cobrados?.length ? ` · ${cobroEfectivo.items_cobrados.length} comprobantes` : ""}
          </p>
          {aCentavos(cobroEfectivo.monto_snapshot) < aCentavos(cobroEfectivo.deuda.monto) && (
            <p className="detalle-fecha">
              Queda pendiente Bs.{" "}
              {formatoBs(aCentavos(cobroEfectivo.deuda.monto) - aCentavos(cobroEfectivo.monto_snapshot))}
            </p>
          )}
          <div className="acciones">
            <button className="boton-secundario" onClick={() => navigate(`/comprobante/efectivo/${cobroEfectivo.id}`)}>
              Imprimir comprobante
            </button>
            <button ref={siguienteRef} onClick={nuevoCliente}>
              Siguiente cliente (Enter)
            </button>
          </div>
        </div>
      )}

      {transaccion && (
        <div className="tarjeta tarjeta-qr resultado">
          <p className="resultado__ok">QR generado</p>
          {transaccion.imagen_qr_base64 ? (
            <img
              className="qr-imagen"
              src={`data:image/png;base64,${transaccion.imagen_qr_base64}`}
              alt={`Código QR de cobro por Bs. ${transaccion.monto_snapshot}`}
            />
          ) : (
            <p className="mensaje-error">La pasarela no devolvió una imagen de QR.</p>
          )}
          <p className="monto">Bs. {formatoBs(aCentavos(transaccion.monto_snapshot))}</p>
          <p className="detalle-fecha">El cliente lo escanea desde su banco; el pago se confirma solo.</p>
          <div className="acciones">
            <button className="boton-secundario" onClick={() => navigate("/transacciones")}>
              Ver transacciones
            </button>
            <button ref={siguienteRef} onClick={nuevoCliente}>
              Siguiente cliente (Enter)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Vuelto({ vuelto }: { vuelto: number }) {
  if (vuelto < 0) {
    return <p className="vuelto vuelto--falta">Falta Bs. {formatoBs(-vuelto)}</p>;
  }
  return (
    <div className="vuelto">
      <span className="detalle-fecha">Vuelto</span>
      <strong className="monto">Bs. {formatoBs(vuelto)}</strong>
      {vuelto > 0 && <DesgloseVuelto centavos={vuelto} />}
    </div>
  );
}

function DesgloseVuelto({ centavos }: { centavos: number }) {
  if (centavos <= 0) return null;
  const { piezas, resto } = desgloseVuelto(centavos);
  return (
    <div className="desglose" aria-label="Cómo dar el vuelto">
      {piezas.map((p) => (
        <span key={p.centavos} className={p.esBillete ? "pieza pieza--billete" : "pieza pieza--moneda"}>
          {p.cantidad} × {p.centavos >= 100 ? p.centavos / 100 : `0,${String(p.centavos).padStart(2, "0")}`}
        </span>
      ))}
      {resto > 0 && <span className="detalle-fecha">+ {resto} ctvs. sin moneda</span>}
    </div>
  );
}
