import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ProformaCobro } from "../components/ProformaCobro";
import type { CobroAgrupado, CobroEfectivo, Deuda, FormasPago, ItemDeuda, TransaccionQR } from "../api/types";
import {
  consultarDeuda,
  generarTransaccionQR,
  listarCajas,
  obtenerFormasPago,
  registrarCobroAgrupado,
  registrarCobroEfectivo,
} from "../api/cobranza";
import { ApiError } from "../api/client";
import { FacturasAnteriores } from "../components/FacturasAnteriores";
import { useAuth } from "../context/AuthContext";
import { aCentavos, aDecimal, desgloseVuelto, fechaCorta, formatoBs, formatoKwh, sugerenciasDePago } from "../utils/dinero";

type Metodo = "efectivo" | "qr" | "documento";

const DOCUMENTO_VACIO = { ente_id: "", banco_id: "", numero: "", fecha_registro: "", fecha_vencimiento: "" };

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
  // Cheque, depósito, tarjeta... (solo con caja del SIIC).
  const [formasPago, setFormasPago] = useState<FormasPago | null>(null);
  const [documento, setDocumento] = useState(DOCUMENTO_VACIO);
  const [conProforma, setConProforma] = useState(false);

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
    if (!esCajera || !sesion?.cajaSiic) return;
    obtenerFormasPago()
      .then(setFormasPago)
      .catch(() => setFormasPago(null));
  }, [esCajera, sesion?.cajaSiic]);

  const enteDocumento = formasPago?.entes.find((e) => String(e.id) === documento.ente_id);
  const esCheque = enteDocumento?.descripcion.toUpperCase() === "CHEQUE";

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
    setDocumento(DOCUMENTO_VACIO);
    setConProforma(false);
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

  // Proforma: cada cliente elegido se consulta como siempre y entra al cobro con las facturas de la
  // proforma ya marcadas (las más antiguas, hasta el mes elegido).
  async function agregarDesdeProforma(clientes: { nro_cliente: string; cantidad: number }[]) {
    setError(null);
    let nuevo = [...carrito];
    const fallidos: string[] = [];
    for (const c of clientes) {
      try {
        const deuda = await consultarDeuda(c.nro_cliente);
        const entrada = { deuda, cantidad: Math.min(c.cantidad, deuda.items?.length ?? 0) };
        const i = nuevo.findIndex((e) => e.deuda.cliente.codigo_externo === deuda.cliente.codigo_externo);
        nuevo = i >= 0 ? nuevo.map((e, j) => (j === i ? entrada : e)) : [...nuevo, entrada];
      } catch {
        fallidos.push(c.nro_cliente);
      }
    }
    setCarrito(nuevo);
    setActivo(0);
    setMetodo("efectivo");
    setRecibido("");
    if (fallidos.length) setError(`No se pudo consultar: ${fallidos.join(", ")}. Los demás se agregaron.`);
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

  async function onCobrarConDocumento(e: FormEvent) {
    e.preventDefault();
    if (conDeuda.length === 0 || aCobrar <= 0 || seleccionInvalida || !enteDocumento) return;
    const datos = {
      ente_id: Number(documento.ente_id),
      banco_id: Number(documento.banco_id),
      numero: documento.numero.trim(),
      ...(esCheque
        ? { fecha_registro: documento.fecha_registro.replace(/-/g, ""), fecha_vencimiento: documento.fecha_vencimiento.replace(/-/g, "") }
        : {}),
    };
    setError(null);
    setEnviando(true);
    try {
      if (conDeuda.length === 1) {
        const unico = conDeuda[0];
        setCobroEfectivo(
          await registrarCobroEfectivo(unico.deuda.id, aDecimal(aCobrar), cobraTodo(unico) ? undefined : unico.cantidad, datos),
        );
      } else {
        setCobroAgrupado(
          await registrarCobroAgrupado(
            aDecimal(aCobrar),
            conDeuda.map((c) =>
              cobraTodo(c) ? { deuda_id: c.deuda.id } : { deuda_id: c.deuda.id, cantidad_comprobantes: c.cantidad },
            ),
            datos,
          ),
        );
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el cobro.");
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
          <kbd>Enter</kbd> buscar / cobrar · <kbd>Esc</kbd> cobro nuevo
        </span>
      </div>

      {esCajera && sinCajaAbierta && (
        <p className="aviso">
          {sesion?.cajaSiic
            ? "No tienes una caja abierta: ábrela para poder cobrar."
            : "No tienes una caja abierta: los cobros se registran igual, pero no entran en ningún cierre."}{" "}
          <Link to="/caja">Abrir caja</Link>
        </p>
      )}

      {!terminado && (
        <form className="buscador" onSubmit={onConsultar}>
          <input
            ref={codigoInputRef}
            inputMode="text"
            placeholder={carrito.length ? "Agregar otro cliente al cobro (N° de cliente o de cuenta)" : "N° de cliente o de cuenta (05-059-07421)"}
            value={codigoExterno}
            onChange={(e) => setCodigoExterno(e.target.value)}
            autoFocus
          />
          <button type="submit" disabled={cargando}>
            {cargando ? "Buscando..." : carrito.length ? "Agregar" : "Buscar"}
          </button>
          {!conProforma && (
            <button type="button" className="boton-secundario" onClick={() => setConProforma(true)}>
              Proforma
            </button>
          )}
        </form>
      )}

      {conProforma && !terminado && (
        <ProformaCobro onAgregar={agregarDesdeProforma} onCerrar={() => setConProforma(false)} />
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
                  {actual.deuda.datos_cliente?.nro_cuenta ? ` · Cuenta ${actual.deuda.datos_cliente.nro_cuenta}` : ""}
                  {actual.deuda.cliente.nit_ci ? ` · NIT/CI ${actual.deuda.cliente.nit_ci}` : ""}
                </p>
                <DatosSuministro datos={actual.deuda.datos_cliente} />
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
                    {formasPago?.disponible && (
                      <button
                        role="tab"
                        aria-selected={metodo === "documento"}
                        className={metodo === "documento" ? "pestana pestana--activa" : "pestana"}
                        onClick={() => setMetodo("documento")}
                      >
                        Cheque / otro
                      </button>
                    )}
                  </div>

                  {metodo === "documento" && formasPago?.disponible ? (
                    <form className="efectivo" onSubmit={onCobrarConDocumento}>
                      <div className="documento-cobro">
                        <label>
                          Tipo
                          <select
                            required
                            value={documento.ente_id}
                            onChange={(e) => setDocumento({ ...documento, ente_id: e.target.value })}
                          >
                            <option value="">Elige</option>
                            {formasPago.entes.map((ente) => (
                              <option key={ente.id} value={ente.id}>
                                {ente.descripcion}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Banco
                          <select
                            required
                            value={documento.banco_id}
                            onChange={(e) => setDocumento({ ...documento, banco_id: e.target.value })}
                          >
                            <option value="">Elige</option>
                            {formasPago.bancos.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.descripcion}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Número
                          <input
                            required
                            maxLength={20}
                            value={documento.numero}
                            onChange={(e) => setDocumento({ ...documento, numero: e.target.value })}
                          />
                        </label>
                        {esCheque && (
                          <>
                            <label>
                              Emisión
                              <input
                                required
                                type="date"
                                value={documento.fecha_registro}
                                onChange={(e) => setDocumento({ ...documento, fecha_registro: e.target.value })}
                              />
                            </label>
                            <label>
                              Vencimiento
                              <input
                                required
                                type="date"
                                value={documento.fecha_vencimiento}
                                onChange={(e) => setDocumento({ ...documento, fecha_vencimiento: e.target.value })}
                              />
                            </label>
                          </>
                        )}
                      </div>
                      <p className="detalle-fecha">
                        {esCheque
                          ? "El cheque tiene que vencer en más de 3 días y a no más de 27 días de su emisión."
                          : "El documento cubre el monto exacto: no hay vuelto."}
                      </p>
                      <button type="submit" className="boton-principal" disabled={enviando}>
                        {enviando
                          ? "Registrando..."
                          : `Cobrar Bs. ${formatoBs(aCobrar)}${enteDocumento ? ` con ${enteDocumento.descripcion.toLowerCase()}` : ""}${varios ? ` (${conDeuda.length} clientes)` : ""}`}
                      </button>
                    </form>
                  ) : metodo === "efectivo" || conDeuda.length > 1 ? (
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
          onImprimir={() => navigate(`/comprobante/efectivo/${cobroEfectivo.id}?imprimir=1`)}
          onSiguiente={nuevoCobro}
        />
      )}

      {cobroAgrupado && (
        <ResultadoEfectivo
          vuelto={aCentavos(cobroAgrupado.vuelto)}
          cobrado={aCentavos(cobroAgrupado.monto_total)}
          recibido={aCentavos(cobroAgrupado.monto_recibido)}
          detalle={cobroAgrupado.cobros}
          onImprimir={() => navigate(`/comprobante/grupo/${cobroAgrupado.id}?imprimir=1`)}
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

/** Dirección, medidor, categoría y estado del suministro, como la app Java. Un estado que no sea
 * "CONECTADO" (cortado, suspendido...) sale resaltado para que la cajera lo vea. */
function DatosSuministro({ datos }: { datos?: Deuda["datos_cliente"] }) {
  if (!datos || !(datos.direccion || datos.nro_medidor || datos.estado)) return null;
  const conectado = !datos.estado || datos.estado.toUpperCase() === "CONECTADO";
  return (
    <div className="suministro">
      {datos.estado && <span className={`estado ${conectado ? "estado--pagado" : "estado--error"}`}>{datos.estado}</span>}
      {datos.categoria && <span className="suministro__dato">{datos.categoria}</span>}
      {datos.nro_medidor && <span className="suministro__dato">Medidor {datos.nro_medidor}</span>}
      {datos.direccion && <span className="suministro__dato">{datos.direccion}</span>}
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
  const documento = detalle[0]?.documento && "ente" in detalle[0].documento ? detalle[0].documento : null;
  const siguiente = useRef<HTMLButtonElement>(null);
  useEffect(() => siguiente.current?.focus(), []);
  return (
    <div className="tarjeta tarjeta-qr resultado">
      <p className="resultado__ok">Cobro registrado</p>
      {documento ? (
        <>
          <span className="detalle-fecha">Pagado con</span>
          <p className="monto">
            {documento.ente.charAt(0) + documento.ente.slice(1).toLowerCase()} {documento.numero}
          </p>
          <p className="detalle-fecha">
            {documento.banco} · Bs. {formatoBs(cobrado)} · sin vuelto
          </p>
        </>
      ) : (
        <>
          <span className="detalle-fecha">Vuelto a entregar</span>
          <p className="monto monto--vuelto">Bs. {formatoBs(vuelto)}</p>
          <DesgloseVuelto centavos={vuelto} />
          <p className="detalle-fecha">
            Cobrado Bs. {formatoBs(cobrado)} · Recibido Bs. {formatoBs(recibido)}
          </p>
        </>
      )}
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
                    · {(c.items_cobrados?.length ?? 0) === 1 ? "1 comprobante" : `${c.items_cobrados?.length ?? 0} comprobantes`}
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
