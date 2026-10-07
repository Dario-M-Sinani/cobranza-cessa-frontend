import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { CobroAgrupado, CobroEfectivo, Deuda, ItemDeuda, TransaccionQR } from "../api/types";
import {
  consultarDeuda,
  generarTransaccionQR,
  listarCajas,
  registrarCobroAgrupado,
  registrarCobroEfectivo,
} from "../api/cobranza";
import { ApiError } from "../api/client";
import { reimprimirUltimo } from "../utils/reimprimir";
import { FacturasAnteriores } from "../components/FacturasAnteriores";
import { useAuth } from "../context/AuthContext";
import { aCentavos, aDecimal, desgloseVuelto, fechaCorta, formatoBs, formatoKwh, sugerenciasDePago } from "../utils/dinero";

type Metodo = "efectivo" | "qr";

// Un cliente dentro del cobro en curso: su deuda consultada y cuántos comprobantes se
// le cobran (siempre los N más antiguos; SIIC no deja saltear).
interface EnCarrito {
  deuda: Deuda;
  cantidad: number;
}

function montoDe(entrada: EnCarrito): number {
  const items = entrada.deuda.items ?? [];
  if (items.length === 0) return aCentavos(entrada.deuda.monto);
  return items.slice(0, entrada.cantidad).reduce((suma, item) => suma + aCentavos(item.importe), 0);
}

function cobraTodo(entrada: EnCarrito): boolean {
  const items = entrada.deuda.items ?? [];
  return items.length === 0 || entrada.cantidad === items.length;
}

/**
 * Pantalla de cobro: buscar cliente → elegir comprobantes → (opcional) agregar más
 * clientes al mismo cobro → efectivo (un solo vuelto) o QR (un cliente) → siguiente.
 *
 * SIIC cobra comprobantes enteros y del más antiguo al más nuevo, y la deuda ya llega en
 * ese orden: por cliente la selección es "los N primeros". Marcar uno marca los
 * anteriores; desmarcar uno desmarca los siguientes.
 */
export function ConsultaDeudaPage() {
  const { sesion } = useAuth();
  const navigate = useNavigate();
  const codigoInputRef = useRef<HTMLInputElement>(null);
  const recibidoInputRef = useRef<HTMLInputElement>(null);
  const siguienteRef = useRef<HTMLButtonElement>(null);

  const [codigoExterno, setCodigoExterno] = useState("");
  const [carrito, setCarrito] = useState<EnCarrito[]>([]);
  const [activo, setActivo] = useState(0);
  const [metodo, setMetodo] = useState<Metodo>("efectivo");
  const [recibido, setRecibido] = useState("");
  const [transaccion, setTransaccion] = useState<TransaccionQR | null>(null);
  const [cobroEfectivo, setCobroEfectivo] = useState<CobroEfectivo | null>(null);
  const [cobroAgrupado, setCobroAgrupado] = useState<CobroAgrupado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [sinCajaAbierta, setSinCajaAbierta] = useState(false);

  const esCajera = sesion?.rol === "cajera";
  const actual: EnCarrito | null = carrito[activo] ?? null;
  const conDeuda = carrito.filter((e) => aCentavos(e.deuda.monto) > 0);
  const varios = carrito.length > 1;
  const aCobrar = carrito.reduce((suma, e) => suma + Math.max(montoDe(e), 0), 0);
  const seleccionInvalida = carrito.some((e) => aCentavos(e.deuda.monto) > 0 && montoDe(e) <= 0);
  const recibidoCentavos = aCentavos(recibido);
  const vuelto = recibidoCentavos - aCobrar;
  const terminado = Boolean(cobroEfectivo || transaccion || cobroAgrupado);

  useEffect(() => {
    if (!esCajera) return;
    listarCajas()
      .then((cajas) => setSinCajaAbierta(!cajas.some((c) => c.estado === "abierta")))
      .catch(() => setSinCajaAbierta(false));
  }, [esCajera]);

  function nuevoCobro() {
    setCodigoExterno("");
    setCarrito([]);
    setActivo(0);
    setRecibido("");
    setMetodo("efectivo");
    setTransaccion(null);
    setCobroEfectivo(null);
    setCobroAgrupado(null);
    setError(null);
    codigoInputRef.current?.focus();
  }

  // Esc: siempre vuelve a un cobro nuevo, listo para el próximo cliente.
  useEffect(() => {
    function alPresionar(e: KeyboardEvent) {
      if (e.key === "Escape") nuevoCobro();
    }
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, []);

  useEffect(() => {
    if (terminado) siguienteRef.current?.focus();
  }, [terminado]);

  async function onConsultar(e: FormEvent) {
    e.preventDefault();
    const codigo = codigoExterno.trim();
    if (!codigo) return;
    setError(null);
    setCargando(true);
    try {
      const deuda = await consultarDeuda(codigo);
      const entrada = { deuda, cantidad: deuda.items?.length ?? 0 };
      const existente = carrito.findIndex((c) => c.deuda.cliente.codigo_externo === deuda.cliente.codigo_externo);
      if (existente >= 0) {
        // Ya estaba: se reemplaza por la consulta fresca.
        setCarrito(carrito.map((c, i) => (i === existente ? entrada : c)));
        setActivo(existente);
      } else {
        setCarrito([...carrito, entrada]);
        setActivo(carrito.length);
      }
      setCodigoExterno("");
      setRecibido("");
      if (carrito.length > 0) setMetodo("efectivo");
      setTimeout(() => recibidoInputRef.current?.focus(), 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo consultar la deuda.");
    } finally {
      setCargando(false);
    }
  }

  function alternarComprobante(indice: number) {
    if (!actual) return;
    const cantidad = indice < actual.cantidad ? indice : indice + 1;
    setCarrito(carrito.map((c, i) => (i === activo ? { ...c, cantidad } : c)));
    setRecibido("");
  }

  function quitar(indice: number) {
    const restantes = carrito.filter((_, i) => i !== indice);
    setCarrito(restantes);
    setActivo(Math.max(0, Math.min(activo >= indice ? activo - 1 : activo, restantes.length - 1)));
    setRecibido("");
    if (restantes.length === 0) codigoInputRef.current?.focus();
  }

  async function onCobrarEfectivo(e?: FormEvent) {
    e?.preventDefault();
    if (conDeuda.length === 0 || aCobrar <= 0 || seleccionInvalida) return;
    const montoRecibido = recibido === "" ? aCobrar : recibidoCentavos;
    if (montoRecibido < aCobrar) {
      setError(`Falta Bs. ${formatoBs(aCobrar - montoRecibido)} para cubrir el cobro.`);
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      if (conDeuda.length === 1) {
        const unico = conDeuda[0];
        setCobroEfectivo(
          await registrarCobroEfectivo(unico.deuda.id, aDecimal(montoRecibido), cobraTodo(unico) ? undefined : unico.cantidad),
        );
      } else {
        setCobroAgrupado(
          await registrarCobroAgrupado(
            aDecimal(montoRecibido),
            conDeuda.map((c) =>
              cobraTodo(c) ? { deuda_id: c.deuda.id } : { deuda_id: c.deuda.id, cantidad_comprobantes: c.cantidad },
            ),
          ),
        );
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el cobro en efectivo.");
    } finally {
      setEnviando(false);
    }
  }

  async function onGenerarQR() {
    if (conDeuda.length !== 1 || aCobrar <= 0) return;
    const unico = conDeuda[0];
    setError(null);
    setEnviando(true);
    try {
      setTransaccion(await generarTransaccionQR(unico.deuda.id, cobraTodo(unico) ? undefined : unico.cantidad));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo generar el QR.");
    } finally {
      setEnviando(false);
    }
  }

  const items: ItemDeuda[] = actual?.deuda.items ?? [];

  return (
    <div className="pagina pagina--cobro">
      <div className="pagina__encabezado">
        <h1>Cobrar</h1>
        <span className="atajos">
          <kbd>Enter</kbd> buscar / cobrar · <kbd>Esc</kbd> cobro nuevo · <kbd>F9</kbd> reimprimir último{" "}
          <button type="button" className="boton-secundario boton-chico" onClick={reimprimirUltimo}>
            Reimprimir último
          </button>
        </span>
      </div>

      {esCajera && sinCajaAbierta && (
        <p className="aviso">
          No tienes una caja abierta: los cobros se registran igual, pero no entran en ningún cierre.{" "}
          <Link to="/caja">Abrir caja</Link>
        </p>
      )}

      {!terminado && (
        <form className="buscador" onSubmit={onConsultar}>
          <input
            ref={codigoInputRef}
            inputMode="numeric"
            placeholder={carrito.length ? "Agregar otro cliente al cobro (número)" : "Número de cliente"}
            value={codigoExterno}
            onChange={(e) => setCodigoExterno(e.target.value)}
            autoFocus
          />
          <button type="submit" disabled={cargando}>
            {cargando ? "Buscando..." : carrito.length ? "Agregar" : "Buscar"}
          </button>
        </form>
      )}

      {error && <p className="mensaje-error">{error}</p>}

      {actual && !terminado && (
        <div className="cobro">
          <section className="cobro__cliente tarjeta tarjeta--ancha">
            {varios && (
              <div className="clientes-cobro" role="tablist" aria-label="Clientes en este cobro">
                {carrito.map((c, i) => (
                  <span key={c.deuda.cliente.codigo_externo} className={i === activo ? "cliente-chip cliente-chip--activo" : "cliente-chip"}>
                    <button type="button" role="tab" aria-selected={i === activo} onClick={() => setActivo(i)}>
                      {c.deuda.cliente.codigo_externo} · Bs. {formatoBs(Math.max(montoDe(c), 0))}
                    </button>
                    <button type="button" className="cliente-chip__quitar" aria-label={`Quitar ${c.deuda.cliente.nombre}`} onClick={() => quitar(i)}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="cliente-cabecera">
              <div>
                <h2>{actual.deuda.cliente.nombre}</h2>
                <p className="detalle-fecha">
                  Cliente {actual.deuda.cliente.codigo_externo}
                  {actual.deuda.cliente.nit_ci ? ` · NIT/CI ${actual.deuda.cliente.nit_ci}` : ""}
                </p>
              </div>
              <div className="cliente-cabecera__total">
                <span className="detalle-fecha">Deuda total</span>
                <strong>Bs. {formatoBs(aCentavos(actual.deuda.monto))}</strong>
              </div>
            </div>

            {aCentavos(actual.deuda.monto) <= 0 ? (
              <p className="sin-deuda">Este cliente no tiene deuda pendiente.</p>
            ) : items.length > 0 ? (
              <>
                <table className="tabla tabla--comprobantes">
                  <thead>
                    <tr>
                      <th aria-label="Cobrar" />
                      <th>Concepto</th>
                      <th>Emisión</th>
                      <th>Vence</th>
                      <th className="num">Consumo (kWh)</th>
                      <th className="num">Importe (Bs.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => {
                      const marcado = i < actual.cantidad;
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
                          <td className="num">{formatoKwh(item.consumo_kwh)}</td>
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

            <FacturasAnteriores key={actual.deuda.cliente.codigo_externo} codigoCliente={actual.deuda.cliente.codigo_externo} />
          </section>

          {esCajera && conDeuda.length > 0 && (
            <section className="cobro__panel tarjeta">
              {varios ? (
                <div className="resumen-carrito">
                  <span className="detalle-fecha">Cobro de {carrito.length} clientes</span>
                  {carrito.map((c, i) => (
                    <div key={c.deuda.cliente.codigo_externo} className="resumen-carrito__fila" onClick={() => setActivo(i)}>
                      <span>
                        {c.deuda.cliente.nombre}
                        <span className="detalle-fecha">
                          {" "}
                          · {(c.deuda.items?.length ?? 0) > 0 ? `${c.cantidad} de ${c.deuda.items.length}` : "total"}
                        </span>
                      </span>
                      <span className="num">{formatoBs(Math.max(montoDe(c), 0))}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="resumen-cobro">
                <span className="detalle-fecha">
                  {varios
                    ? "Total a cobrar"
                    : `A cobrar${items.length ? ` · ${actual.cantidad} de ${items.length} comprobantes` : ""}`}
                </span>
                <strong className="monto monto--grande">Bs. {formatoBs(aCobrar)}</strong>
                {!varios && !cobraTodo(actual) && aCobrar > 0 && (
                  <span className="detalle-fecha">
                    Queda pendiente Bs. {formatoBs(aCentavos(actual.deuda.monto) - aCobrar)}
                  </span>
                )}
              </div>

              {seleccionInvalida || aCobrar <= 0 ? (
                <p className="mensaje-error">
                  {carrito.some((c) => aCentavos(c.deuda.monto) > 0 && c.cantidad === 0)
                    ? "Hay un cliente sin comprobantes marcados: márcale al menos uno o quítalo del cobro."
                    : "Lo marcado suma Bs. 0 o menos por las notas de crédito: marca el siguiente comprobante."}
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
                      disabled={conDeuda.length > 1}
                      title={conDeuda.length > 1 ? "El QR se genera para un cliente a la vez" : undefined}
                    >
                      QR
                    </button>
                  </div>

                  {metodo === "efectivo" || conDeuda.length > 1 ? (
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
                        {enviando
                          ? "Registrando..."
                          : `Cobrar Bs. ${formatoBs(aCobrar)}${varios ? ` (${conDeuda.length} clientes)` : " en efectivo"}`}
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
              <p className="detalle-fecha">
                ¿Paga también otra cuenta? Búscala arriba y se suma a este cobro con un solo vuelto.
              </p>
            </section>
          )}
        </div>
      )}

      {cobroEfectivo && (
        <ResultadoEfectivo
          vuelto={aCentavos(cobroEfectivo.vuelto)}
          cobrado={aCentavos(cobroEfectivo.monto_snapshot)}
          recibido={aCentavos(cobroEfectivo.monto_recibido)}
          detalle={[cobroEfectivo]}
          onImprimir={() => navigate(`/comprobante/efectivo/${cobroEfectivo.id}`)}
          onSiguiente={nuevoCobro}
        />
      )}

      {cobroAgrupado && (
        <ResultadoEfectivo
          vuelto={aCentavos(cobroAgrupado.vuelto)}
          cobrado={aCentavos(cobroAgrupado.monto_total)}
          recibido={aCentavos(cobroAgrupado.monto_recibido)}
          detalle={cobroAgrupado.cobros}
          onImprimir={() => navigate(`/comprobante/grupo/${cobroAgrupado.id}`)}
          onSiguiente={nuevoCobro}
        />
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
            <button ref={siguienteRef} onClick={nuevoCobro}>
              Siguiente cliente (Enter)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultadoEfectivo(props: {
  vuelto: number;
  cobrado: number;
  recibido: number;
  detalle: CobroEfectivo[];
  onImprimir: () => void;
  onSiguiente: () => void;
}) {
  const { vuelto, cobrado, recibido, detalle } = props;
  const siguiente = useRef<HTMLButtonElement>(null);
  useEffect(() => siguiente.current?.focus(), []);
  return (
    <div className="tarjeta tarjeta-qr resultado">
      <p className="resultado__ok">Cobro registrado</p>
      <span className="detalle-fecha">Vuelto a entregar</span>
      <p className="monto monto--vuelto">Bs. {formatoBs(vuelto)}</p>
      <DesgloseVuelto centavos={vuelto} />
      <p className="detalle-fecha">
        Cobrado Bs. {formatoBs(cobrado)} · Recibido Bs. {formatoBs(recibido)}
      </p>
      <table className="comprobante__tabla">
        <tbody>
          {detalle.map((c) => {
            const pendiente = aCentavos(c.deuda.monto) - aCentavos(c.monto_snapshot);
            return (
              <tr key={c.id}>
                <td>
                  {c.deuda.cliente.nombre}
                  <span className="detalle-fecha">
                    {" "}
                    · {c.items_cobrados?.length ?? 0} comprobantes
                    {pendiente > 0 ? ` · queda Bs. ${formatoBs(pendiente)}` : ""}
                  </span>
                </td>
                <td className="num">{formatoBs(aCentavos(c.monto_snapshot))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="acciones">
        <button className="boton-secundario" onClick={props.onImprimir}>
          Imprimir comprobante
        </button>
        <button ref={siguiente} onClick={props.onSiguiente}>
          Siguiente cliente (Enter)
        </button>
      </div>
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
