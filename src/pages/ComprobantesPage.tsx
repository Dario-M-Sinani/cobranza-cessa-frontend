import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { anularComprobante, listarComprobantesDelDia, type ComprobanteDelDia } from "../api/cobranza";
import { ApiError } from "../api/client";
import { listarCajeros, type Entidad } from "../api/cajeros";
import { useAuth } from "../context/AuthContext";
import { BotonFactura } from "../components/BotonFactura";
import { aCentavos, formatoBs } from "../utils/dinero";
import { fechaISO, hoyISO, hora } from "../utils/fechas";

// Desde cuántos clientes un cobro se muestra resumido (una proforma pueden ser cientos).
const RESUMIR_DESDE = 4;

/**
 * Cobros del panel de un día, para supervisor/admin: buscar el comprobante de un cliente y
 * reimprimirlo (la cajera imprime cada uno una sola vez, al cobrar). La reimpresión sale
 * marcada y queda en Auditoría. La cajera ve acá sus propios cobros ("Mis cobros"): todos,
 * efectivo, documentos y QR; imprime el que todavía no imprimió y no anula.
 */
export function ComprobantesPage() {
  const { sesion } = useAuth();
  const esCajera = sesion?.rol === "cajera";
  const columnas = esCajera ? 8 : 9;
  const [fecha, setFecha] = useState(hoyISO());
  const [filas, setFilas] = useState<ComprobanteDelDia[]>([]);
  const [cajero, setCajero] = useState("");
  // Como "Transacciones" de la app Java: primero la entidad (CESSA o un banco) y después el cajero.
  const [entidad, setEntidad] = useState("");
  const [nombresEntidad, setNombresEntidad] = useState<Entidad[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Fila con el formulario de anulación abierto ("tipo-id") y su motivo.
  const [anulando, setAnulando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [recarga, setRecarga] = useState(0);
  // Cobros de muchos clientes desplegados ("tipo-id").
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  function alternarAbierto(clave: string) {
    setAbiertos((previo) => {
      const nuevo = new Set(previo);
      if (nuevo.has(clave)) nuevo.delete(clave);
      else nuevo.add(clave);
      return nuevo;
    });
  }

  async function onAnular(evento: FormEvent, f: ComprobanteDelDia) {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    setAviso(null);
    try {
      await anularComprobante(f.tipo, f.id, motivo.trim());
      setAviso(`${f.numero} anulado. La deuda del cliente vuelve a quedar pendiente.`);
      setAnulando(null);
      setMotivo("");
      setRecarga((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo anular el cobro.");
    } finally {
      setEnviando(false);
    }
  }

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);
    listarComprobantesDelDia(fecha)
      .then((r) => vigente && setFilas(r.comprobantes))
      .catch((err) => vigente && setError(err instanceof ApiError ? err.message : "No se pudieron cargar los cobros."))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [fecha, recarga]);

  // Nombres de las entidades (la Nest, con el usuario de quien mira); sin ella, se muestra el número.
  useEffect(() => {
    if (esCajera) return;
    let vigente = true;
    listarCajeros()
      .then((r) => vigente && setNombresEntidad(r.entidades))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [esCajera]);

  const entidades = useMemo(() => {
    const ids = [...new Set(filas.map((f) => (f.entidad_id === null ? "local" : String(f.entidad_id))))];
    const nombre = (id: string) =>
      id === "local" ? "Usuarios del panel" : nombresEntidad.find((e) => String(e.id) === id)?.descripcion ?? `Entidad ${id}`;
    return ids.map((id) => ({ id, nombre: nombre(id) })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [filas, nombresEntidad]);

  const deLaEntidad = (f: ComprobanteDelDia) => !entidad || (f.entidad_id === null ? "local" : String(f.entidad_id)) === entidad;

  const cajeros = useMemo(() => [...new Set(filas.filter(deLaEntidad).map((f) => f.cajero))].sort(), [filas, entidad]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return filas.filter(
      (f) =>
        deLaEntidad(f) &&
        (!cajero || f.cajero === cajero) &&
        (!texto ||
          f.numero.toLowerCase().includes(texto) ||
          f.facturas.some((n) => n.includes(texto)) ||
          f.clientes.some((c) => c.codigo.includes(texto) || c.nombre.toLowerCase().includes(texto)))
    );
  }, [filas, entidad, cajero, busqueda]); // eslint-disable-line react-hooks/exhaustive-deps

  const texto = busqueda.trim().toLowerCase();
  const coincide = (c: { codigo: string; nombre: string; factura?: string }) =>
    !texto || c.codigo.includes(texto) || c.nombre.toLowerCase().includes(texto) || (c.factura ?? "").includes(texto);
  const total = visibles.reduce((suma, f) => suma + (f.anulacion ? 0 : aCentavos(f.monto)), 0);
  const anulados = visibles.filter((f) => f.anulacion).length;

  return (
    <div className="pagina pagina--ancha">
      <div className="pagina__encabezado">
        <h1>{esCajera ? "Mis cobros" : "Comprobantes"}</h1>
      </div>
      <p className="detalle-fecha">
        {esCajera
          ? "Todos tus cobros del día: efectivo, cheques u otros documentos y QR. Cada comprobante se imprime una sola vez; para reimprimir o anular, pídelo a tu supervisora."
          : "Cobros del panel (efectivo y QR) por día. La cajera imprime cada comprobante una sola vez; desde acá se reimprime o se anula (solo el mismo día, con motivo), y queda registrado en Auditoría."}
      </p>

      <div className="filtros">
        <label>
          Día <input type="date" value={fecha} max={hoyISO()} onChange={(e) => e.target.value && setFecha(e.target.value)} />
        </label>
        {!esCajera && entidades.length > 1 && (
          <select
            value={entidad}
            onChange={(e) => {
              setEntidad(e.target.value);
              setCajero("");
            }}
            aria-label="Entidad"
          >
            <option value="">Todas las entidades</option>
            {entidades.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        )}
        {!esCajera && (
          <select value={cajero} onChange={(e) => setCajero(e.target.value)} aria-label="Cajero">
            <option value="">Todos los cajeros</option>
            {cajeros.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <input
          type="search"
          placeholder="N° de cliente, nombre o comprobante"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {error && <p className="mensaje-error">{error}</p>}
      {aviso && <p className="mensaje-ok">{aviso}</p>}

      {cargando ? (
        <p>Cargando...</p>
      ) : (
        <>
          <p className="detalle-fecha">
            {fechaISO(fecha)} · {visibles.length === 1 ? "1 cobro" : `${visibles.length} cobros`} · Bs. {formatoBs(total)}
            {anulados > 0 && ` · ${anulados === 1 ? "1 anulado" : `${anulados} anulados`} (no suman)`}
          </p>
          <table className="tabla">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Comprobante</th>
                <th>Cliente</th>
                <th>Forma</th>
                <th className="num">Monto (Bs.)</th>
                {!esCajera && <th>Cajero</th>}
                <th>Factura</th>
                <th>Impreso</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => {
                const clave = `${f.tipo}-${f.id}`;
                const resumido = (f.detalle?.length ?? 0) >= RESUMIR_DESDE;
                // Al buscar un cliente o una factura, el cobro grande se abre solo con lo que coincide.
                const abierto = resumido && (abiertos.has(clave) || (texto !== "" && !f.numero.toLowerCase().includes(texto)));
                const conFactura = f.facturas.filter((n) => /^\d+$/.test(n));
                return (
                <Fragment key={clave}>
                <tr className={f.anulacion ? "fila--anulada" : undefined}>
                  <td className="sin-corte">{hora(f.fecha)}</td>
                  <td className="sin-corte">{f.numero}</td>
                  <td>
                    {resumido ? (
                      <>
                        <strong>{f.clientes.length} clientes</strong>{" "}
                        <span className="detalle-fecha">
                          {f.clientes[0]?.codigo} … {f.clientes[f.clientes.length - 1]?.codigo}
                        </span>
                      </>
                    ) : (
                      f.clientes.map((c) => (
                        <div key={c.codigo}>
                          {c.nombre} <span className="detalle-fecha">{c.codigo}</span>
                        </div>
                      ))
                    )}
                  </td>
                  <td>{f.forma_pago}</td>
                  <td className="num">
                    <span className={f.anulacion ? "tachado" : undefined}>{formatoBs(aCentavos(f.monto))}</span>
                  </td>
                  {!esCajera && <td>{f.cajero}</td>}
                  <td>
                    {resumido ? (
                      <span className="sin-corte">
                        {conFactura.length === f.facturas.length
                          ? `${conFactura[0]} – ${conFactura[conFactura.length - 1]}`
                          : `${conFactura.length} de ${f.facturas.length} registradas`}
                      </span>
                    ) : (
                      f.facturas.map((factura, i) => <div key={i}>{factura}</div>)
                    )}
                  </td>
                  <td>
                    {f.impresiones === 0 ? (
                      <span className="estado estado--pendiente">No</span>
                    ) : (
                      <span title={f.ultima_impresion ? `Última: ${hora(f.ultima_impresion)}` : undefined}>
                        {f.impresiones === 1 ? "1 vez" : `${f.impresiones} veces`}
                      </span>
                    )}
                  </td>
                  <td>
                    {f.anulacion ? (
                      <span className="estado estado--error">Anulado</span>
                    ) : (
                      <div className="acciones">
                        {resumido ? (
                          <button className="boton-secundario boton-chico" onClick={() => alternarAbierto(clave)} aria-expanded={abierto}>
                            {abierto ? "Ocultar clientes" : "Ver clientes"}
                          </button>
                        ) : (
                          <BotonFactura chico facturasIds={f.facturas_ids ?? []} etiqueta={f.facturas_ids?.length > 1 ? "Facturas" : "Factura"} />
                        )}
                        {(!esCajera || f.impresiones === 0) && (
                          <Link className="boton-secundario boton-chico" to={`/comprobante/${f.tipo}/${f.id}?imprimir=1`}>
                            {f.impresiones === 0 ? "Imprimir" : "Reimprimir"}
                          </Link>
                        )}
                        {f.se_puede_anular && (
                          <button
                            className="boton-secundario boton-chico boton-anular"
                            onClick={() => {
                              setAnulando(`${f.tipo}-${f.id}`);
                              setMotivo("");
                            }}
                          >
                            Anular
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
                {abierto && (
                  <tr className="fila--detalle">
                    <td colSpan={columnas}>
                      <table className="tabla tabla--detalle-cobro">
                        <thead>
                          <tr>
                            <th>Cliente</th>
                            <th>Nombre</th>
                            <th className="num">Monto (Bs.)</th>
                            <th>Factura</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {(f.detalle ?? []).filter(coincide).map((c) => (
                            <tr key={c.codigo}>
                              <td>{c.codigo}</td>
                              <td>{c.nombre}</td>
                              <td className="num">{formatoBs(aCentavos(c.monto))}</td>
                              <td>{c.factura}</td>
                              <td>{c.factura_id && <BotonFactura chico facturasIds={[c.factura_id]} etiqueta="Factura" />}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
                {f.anulacion && (
                  <tr className="fila--anulada fila--detalle">
                    <td colSpan={columnas}>
                      Anulado por {f.anulacion.por} a las {hora(f.anulacion.en)}. Motivo: {f.anulacion.motivo}
                    </td>
                  </tr>
                )}
                {anulando === `${f.tipo}-${f.id}` && (
                  <tr className="fila--detalle">
                    <td colSpan={columnas}>
                      <form className="anular" onSubmit={(e) => onAnular(e, f)}>
                        <span>
                          Anular <strong>{f.numero}</strong> (Bs. {formatoBs(aCentavos(f.monto))}
                          {f.clientes.length > 1 ? `, ${f.clientes.length} clientes` : ""}). Se anula también en el SIIC y la
                          deuda vuelve a quedar pendiente.
                        </span>
                        <input
                          required
                          minLength={5}
                          maxLength={255}
                          autoFocus
                          placeholder="Motivo (obligatorio)"
                          value={motivo}
                          onChange={(e) => setMotivo(e.target.value)}
                        />
                        <button type="submit" className="boton-peligro" disabled={enviando || motivo.trim().length < 5}>
                          {enviando ? "Anulando..." : "Anular cobro"}
                        </button>
                        <button type="button" className="boton-secundario" disabled={enviando} onClick={() => setAnulando(null)}>
                          Cancelar
                        </button>
                      </form>
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={columnas}>{filas.length === 0 ? "No hubo cobros en el panel este día." : "Ningún cobro coincide con el filtro."}</td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
