import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { anularComprobante, listarComprobantesDelDia, type ComprobanteDelDia } from "../api/cobranza";
import { ApiError } from "../api/client";
import { aCentavos, formatoBs } from "../utils/dinero";
import { fechaISO, hoyISO, hora } from "../utils/fechas";

/**
 * Cobros del panel de un día, para supervisor/admin: buscar el comprobante de un cliente y
 * reimprimirlo (la cajera imprime cada uno una sola vez, al cobrar). La reimpresión sale
 * marcada y queda en Auditoría.
 */
export function ComprobantesPage() {
  const [fecha, setFecha] = useState(hoyISO());
  const [filas, setFilas] = useState<ComprobanteDelDia[]>([]);
  const [cajero, setCajero] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Fila con el formulario de anulación abierto ("tipo-id") y su motivo.
  const [anulando, setAnulando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [recarga, setRecarga] = useState(0);

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

  const cajeros = useMemo(() => [...new Set(filas.map((f) => f.cajero))].sort(), [filas]);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return filas.filter(
      (f) =>
        (!cajero || f.cajero === cajero) &&
        (!texto ||
          f.numero.toLowerCase().includes(texto) ||
          f.clientes.some((c) => c.codigo.includes(texto) || c.nombre.toLowerCase().includes(texto)))
    );
  }, [filas, cajero, busqueda]);

  const total = visibles.reduce((suma, f) => suma + (f.anulacion ? 0 : aCentavos(f.monto)), 0);
  const anulados = visibles.filter((f) => f.anulacion).length;

  return (
    <div className="pagina pagina--ancha">
      <div className="pagina__encabezado">
        <h1>Comprobantes</h1>
      </div>
      <p className="detalle-fecha">
        Cobros del panel (efectivo y QR) por día. La cajera imprime cada comprobante una sola vez; desde acá se
        reimprime o se anula (solo el mismo día, con motivo), y queda registrado en Auditoría.
      </p>

      <div className="filtros">
        <label>
          Día <input type="date" value={fecha} max={hoyISO()} onChange={(e) => e.target.value && setFecha(e.target.value)} />
        </label>
        <select value={cajero} onChange={(e) => setCajero(e.target.value)} aria-label="Cajero">
          <option value="">Todos los cajeros</option>
          {cajeros.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
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
                <th>Cajero</th>
                <th>Factura</th>
                <th>Impreso</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <Fragment key={`${f.tipo}-${f.id}`}>
                <tr className={f.anulacion ? "fila--anulada" : undefined}>
                  <td className="sin-corte">{hora(f.fecha)}</td>
                  <td className="sin-corte">{f.numero}</td>
                  <td>
                    {f.clientes.map((c) => (
                      <div key={c.codigo}>
                        {c.nombre} <span className="detalle-fecha">{c.codigo}</span>
                      </div>
                    ))}
                  </td>
                  <td>{f.forma_pago}</td>
                  <td className="num">
                    <span className={f.anulacion ? "tachado" : undefined}>{formatoBs(aCentavos(f.monto))}</span>
                  </td>
                  <td>{f.cajero}</td>
                  <td>
                    {f.facturas.map((factura, i) => (
                      <div key={i}>{factura}</div>
                    ))}
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
                        <Link className="boton-secundario boton-chico" to={`/comprobante/${f.tipo}/${f.id}?imprimir=1`}>
                          {f.impresiones === 0 ? "Imprimir" : "Reimprimir"}
                        </Link>
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
                {f.anulacion && (
                  <tr className="fila--anulada fila--detalle">
                    <td colSpan={9}>
                      Anulado por {f.anulacion.por} a las {hora(f.anulacion.en)}. Motivo: {f.anulacion.motivo}
                    </td>
                  </tr>
                )}
                {anulando === `${f.tipo}-${f.id}` && (
                  <tr className="fila--detalle">
                    <td colSpan={9}>
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
              ))}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={9}>{filas.length === 0 ? "No hubo cobros en el panel este día." : "Ningún cobro coincide con el filtro."}</td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
