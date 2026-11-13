import { useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "../api/client";
import { aCentavos, formatoBs } from "../utils/dinero";
import { Icono } from "./Icono";

interface ClienteProforma {
  nro_cliente: string;
  nombre: string;
  direccion: string;
  categoria: string;
  cantidad: number;
  total: string;
}

interface Proforma {
  numero: number;
  descripcion: string;
  clientes: ClienteProforma[];
  con_deuda: number;
}

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/**
 * Proformas (como la pestaña de la app Java): una empresa con muchos medidores paga todo junto. Se
 * eligen sus clientes y se suman al cobro de varios clientes, cada uno con sus facturas hasta el mes
 * elegido ya marcadas.
 */
export function ProformaCobro({
  onAgregar,
  onCerrar,
}: {
  onAgregar: (clientes: { nro_cliente: string; cantidad: number }[]) => Promise<void>;
  onCerrar: () => void;
}) {
  const hoy = new Date();
  const [numero, setNumero] = useState("");
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [proforma, setProforma] = useState<Proforma | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState("");
  const [cargando, setCargando] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onBuscar(evento: FormEvent) {
    evento.preventDefault();
    if (!numero.trim()) return;
    setCargando(true);
    setError(null);
    try {
      const p = await apiFetch<Proforma>(`/proformas/${encodeURIComponent(numero.trim())}/?anio=${anio}&mes=${mes}`);
      setProforma(p);
      setMarcados(new Set(p.clientes.filter((c) => c.cantidad > 0).map((c) => c.nro_cliente)));
    } catch (err) {
      setProforma(null);
      setError(err instanceof ApiError ? err.message : "No se pudo leer la proforma.");
    } finally {
      setCargando(false);
    }
  }

  function alternar(nro: string) {
    setMarcados((previo) => {
      const nuevo = new Set(previo);
      if (nuevo.has(nro)) nuevo.delete(nro);
      else nuevo.add(nro);
      return nuevo;
    });
  }

  async function agregar() {
    if (!proforma) return;
    setAgregando(true);
    setError(null);
    try {
      await onAgregar(
        proforma.clientes
          .filter((c) => marcados.has(c.nro_cliente) && c.cantidad > 0)
          .map((c) => ({ nro_cliente: c.nro_cliente, cantidad: c.cantidad })),
      );
      onCerrar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron agregar los clientes.");
    } finally {
      setAgregando(false);
    }
  }

  const texto = filtro.trim().toLowerCase();
  const visibles = (proforma?.clientes ?? []).filter(
    (c) => !texto || c.nro_cliente.includes(texto) || c.nombre.toLowerCase().includes(texto) || c.direccion.toLowerCase().includes(texto),
  );
  const elegidos = (proforma?.clientes ?? []).filter((c) => marcados.has(c.nro_cliente) && c.cantidad > 0);
  const total = elegidos.reduce((s, c) => s + aCentavos(c.total), 0);

  return (
    <section className="tarjeta tarjeta--ancha proforma">
      <h2 className="tarjeta__titulo">
        <Icono nombre="agencia" /> Cobrar una proforma
      </h2>
      <form className="filtros" onSubmit={onBuscar}>
        <label>
          N° de proforma
          <input inputMode="numeric" autoFocus value={numero} onChange={(e) => setNumero(e.target.value.replace(/\D/g, ""))} />
        </label>
        <label>
          Deuda hasta
          <select value={mes} onChange={(e) => setMes(Number(e.target.value))}>
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label>
          Año
          <input type="number" min={2000} max={2100} value={anio} onChange={(e) => setAnio(Number(e.target.value))} />
        </label>
        <button type="submit" disabled={cargando}>
          {cargando ? "Buscando..." : "Buscar"}
        </button>
        <button type="button" className="boton-secundario" onClick={onCerrar}>
          Cerrar
        </button>
      </form>
      {error && <p className="mensaje-error">{error}</p>}
      {proforma && (
        <>
          <p>
            <strong>{proforma.descripcion}</strong>{" "}
            <span className="detalle-fecha">
              · {proforma.clientes.length} medidores · {proforma.con_deuda} con deuda hasta {MESES[mes - 1].toLowerCase()} de {anio}
            </span>
          </p>
          {proforma.clientes.length > 8 && (
            <input
              className="proforma__filtro"
              type="search"
              placeholder="Filtrar por número, nombre o dirección"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            />
          )}
          <table className="tabla">
            <thead>
              <tr>
                <th></th>
                <th>Cliente</th>
                <th>Nombre / dirección</th>
                <th>Categoría</th>
                <th className="num">Facturas</th>
                <th className="num">Deuda (Bs.)</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((c) => (
                <tr
                  key={c.nro_cliente}
                  className={c.cantidad === 0 ? "fila--anulada" : undefined}
                  onClick={() => c.cantidad > 0 && alternar(c.nro_cliente)}
                >
                  <td>
                    <input
                      type="checkbox"
                      disabled={c.cantidad === 0}
                      checked={marcados.has(c.nro_cliente) && c.cantidad > 0}
                      onChange={() => alternar(c.nro_cliente)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Cobrar a ${c.nombre}`}
                    />
                  </td>
                  <td>
                    <strong>{c.nro_cliente}</strong>
                  </td>
                  <td>
                    {c.nombre}
                    <div className="detalle-fecha">{c.direccion}</div>
                  </td>
                  <td>{c.categoria}</td>
                  <td className="num">{c.cantidad || "—"}</td>
                  <td className="num">{c.cantidad ? formatoBs(aCentavos(c.total)) : "Sin deuda"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="total-efectivo">
            <span className="total-efectivo__etiqueta">
              {elegidos.length === 1 ? "1 cliente" : `${elegidos.length} clientes`}
            </span>
            <span className="total-efectivo__monto">Bs. {formatoBs(total)}</span>
            <button type="button" disabled={agregando || elegidos.length === 0} onClick={agregar}>
              {agregando ? "Agregando..." : "Agregar al cobro"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
