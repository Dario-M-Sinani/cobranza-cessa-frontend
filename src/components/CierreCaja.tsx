import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import { cerrarCaja, declararEfectivo, guardarDocumentoCierre, obtenerCierreCaja } from "../api/cobranza";
import type { Caja, CierreCaja as DatosCierre, DocumentoCierre } from "../api/types";
import { aCentavos, formatoBs } from "../utils/dinero";
import { Icono } from "./Icono";

// Cortes de billetes y monedas en Bs, como el arqueo de la app Java (de Bs 200 a Bs 0,10).
const CORTES: { clave: string; etiqueta: string; centavos: number }[] = [
  { clave: "200", etiqueta: "200", centavos: 20000 },
  { clave: "100", etiqueta: "100", centavos: 10000 },
  { clave: "50", etiqueta: "50", centavos: 5000 },
  { clave: "20", etiqueta: "20", centavos: 2000 },
  { clave: "10", etiqueta: "10", centavos: 1000 },
  { clave: "5", etiqueta: "5", centavos: 500 },
  { clave: "2", etiqueta: "2", centavos: 200 },
  { clave: "1", etiqueta: "1", centavos: 100 },
  { clave: "050", etiqueta: "0,50", centavos: 50 },
  { clave: "020", etiqueta: "0,20", centavos: 20 },
  { clave: "010", etiqueta: "0,10", centavos: 10 },
];

const DOCUMENTO_VACIO = { ente_id: "", banco_id: "", numero: "", importe: "", fecha_registro: "", fecha_vencimiento: "", indice: "" };

function fechaCorta(aaaammdd: string): string {
  return /^\d{8}$/.test(aaaammdd) && aaaammdd !== "00000000" ? `${aaaammdd.slice(6)}/${aaaammdd.slice(4, 6)}/${aaaammdd.slice(0, 4)}` : "";
}

function aIso(aaaammdd: string): string {
  return /^\d{8}$/.test(aaaammdd) && aaaammdd !== "00000000" ? `${aaaammdd.slice(0, 4)}-${aaaammdd.slice(4, 6)}-${aaaammdd.slice(6)}` : "";
}

function claseEnte(ente: string): string {
  if (ente === "EFECTIVO") return "ente ente--efectivo";
  if (ente === "PAGO POR QR") return "ente ente--qr";
  return "ente";
}

/**
 * Arqueo y cierre de la caja del SIIC de la cajera, en tres pasos: efectivo contado por cortes,
 * documentos del día (los QR los registra cada cobro; cheques, depósitos o tarjetas se agregan acá)
 * y cierre. A propósito no muestra lo recaudado ni la diferencia: eso lo ve la supervisora.
 */
export function CierreCaja({ caja, onCerrada }: { caja: Caja; onCerrada: () => void }) {
  const [datos, setDatos] = useState<DatosCierre | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cortes, setCortes] = useState<Record<string, string>>({});
  const [efectivoGuardado, setEfectivoGuardado] = useState(false);
  const [documento, setDocumento] = useState(DOCUMENTO_VACIO);
  const [descripcion, setDescripcion] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [enCurso, setEnCurso] = useState<"efectivo" | "documento" | "cerrar" | null>(null);

  async function cargar() {
    try {
      const d = await obtenerCierreCaja(caja.id);
      setDatos(d);
      if (Object.keys(d.cortes ?? {}).length) {
        setCortes(Object.fromEntries(Object.entries(d.cortes).map(([k, v]) => [k, String(v)])));
        setEfectivoGuardado(true);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el cierre de caja.");
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caja.id]);

  const totalEfectivo = useMemo(
    () => CORTES.reduce((suma, c) => suma + (parseInt(cortes[c.clave] || "0", 10) || 0) * c.centavos, 0),
    [cortes],
  );
  const enteElegido = datos?.entes?.find((e) => String(e.id) === documento.ente_id);
  const esCheque = enteElegido?.descripcion.toUpperCase() === "CHEQUE";

  function cambiarCorte(clave: string, valor: string) {
    setCortes((previo) => ({ ...previo, [clave]: valor.replace(/\D/g, "").slice(0, 5) }));
    setEfectivoGuardado(false);
  }

  async function onGuardarEfectivo(evento: FormEvent) {
    evento.preventDefault();
    setEnCurso("efectivo");
    setError(null);
    setAviso(null);
    try {
      await declararEfectivo(
        caja.id,
        Object.fromEntries(CORTES.map((c) => [c.clave, parseInt(cortes[c.clave] || "0", 10) || 0])),
      );
      setEfectivoGuardado(true);
      setAviso(`Efectivo guardado: Bs. ${formatoBs(totalEfectivo)}.`);
      await cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el efectivo.");
    } finally {
      setEnCurso(null);
    }
  }

  async function onGuardarDocumento(evento: FormEvent) {
    evento.preventDefault();
    setEnCurso("documento");
    setError(null);
    setAviso(null);
    try {
      await guardarDocumentoCierre(caja.id, {
        ente_id: Number(documento.ente_id),
        banco_id: Number(documento.banco_id),
        moneda: "B",
        numero: documento.numero.trim(),
        importe: documento.importe.replace(",", "."),
        ...(esCheque
          ? { fecha_registro: documento.fecha_registro.replace(/-/g, ""), fecha_vencimiento: documento.fecha_vencimiento.replace(/-/g, "") }
          : {}),
        ...(documento.indice ? { indice: documento.indice } : {}),
      });
      setAviso(documento.indice ? "Documento corregido." : "Documento agregado.");
      setDocumento(DOCUMENTO_VACIO);
      await cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el documento.");
    } finally {
      setEnCurso(null);
    }
  }

  function corregir(d: DocumentoCierre) {
    const ente = datos?.entes?.find((e) => e.descripcion === d.ente);
    const banco = datos?.bancos?.find((b) => b.descripcion === d.banco);
    setDocumento({
      ente_id: ente ? String(ente.id) : "",
      banco_id: banco ? String(banco.id) : "",
      numero: d.numero,
      importe: d.importe,
      fecha_registro: aIso(d.fecha_registro),
      fecha_vencimiento: aIso(d.fecha_vencimiento),
      indice: d.indice,
    });
  }

  async function onCerrar() {
    setEnCurso("cerrar");
    setError(null);
    try {
      await cerrarCaja(caja.id, descripcion.trim());
      onCerrada();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cerrar la caja.");
      setConfirmando(false);
      await cargar();
    } finally {
      setEnCurso(null);
    }
  }

  if (!datos) {
    return (
      <section className="tarjeta tarjeta--ancha">
        {error ? <p className="mensaje-error">{error}</p> : <p className="detalle-fecha">Cargando el arqueo...</p>}
      </section>
    );
  }

  const tieneDocumentoManual = datos.documentos.some((d) => d.editable);

  return (
    <section className="tarjeta tarjeta--ancha cierre">
      <h2 className="tarjeta__titulo">
        <Icono nombre="balanza" /> Arqueo y cierre de la caja {caja.caja_codigo}
      </h2>
      {error && <p className="mensaje-error">{error}</p>}
      {aviso && (
        <p className="mensaje-ok">
          <Icono nombre="check" tamano={16} /> {aviso}
        </p>
      )}
      {datos.qr_sin_confirmar > 0 && (
        <p className="aviso">
          <Icono nombre="alerta" tamano={16} /> {datos.qr_sin_confirmar === 1 ? "Hay 1 QR" : `Hay ${datos.qr_sin_confirmar} QR`} esperando
          el pago del cliente: espera la confirmación o anúlalo antes de cerrar.
        </p>
      )}
      {datos.facturas_pendientes > 0 && (
        <p className="aviso">
          <Icono nombre="alerta" tamano={16} />{" "}
          {datos.facturas_pendientes === 1
            ? "1 cobro todavía no se registró en el SIIC."
            : `${datos.facturas_pendientes} cobros todavía no se registraron en el SIIC.`}{" "}
          Se intenta otra vez al cerrar.
        </p>
      )}

      <div className={`paso${efectivoGuardado ? " paso--hecho" : ""}`}>
        <span className="paso__numero">{efectivoGuardado ? <Icono nombre="check" tamano={18} /> : 1}</span>
        <div>
          <h3 className="paso__titulo">
            <Icono nombre="billete" /> Cuenta el efectivo del cajón
          </h3>
          <form onSubmit={onGuardarEfectivo}>
            <div className="cortes">
              {CORTES.map((c) => {
                const cantidad = parseInt(cortes[c.clave] || "0", 10) || 0;
                const esMoneda = c.centavos < 1000;
                return (
                  <label key={c.clave} className={`corte corte--${c.clave}${cantidad ? " corte--con-valor" : ""}`}>
                    <span className={esMoneda ? "corte__moneda" : "corte__billete"}>{c.etiqueta}</span>
                    <input
                      inputMode="numeric"
                      placeholder="0"
                      aria-label={`Cantidad de Bs. ${c.etiqueta}`}
                      value={cortes[c.clave] ?? ""}
                      onChange={(e) => cambiarCorte(c.clave, e.target.value)}
                    />
                    <small>{cantidad ? `Bs. ${formatoBs(cantidad * c.centavos)}` : ""}</small>
                  </label>
                );
              })}
            </div>
            <div className="total-efectivo">
              <span className="total-efectivo__etiqueta">Total contado</span>
              <span className="total-efectivo__monto">Bs. {formatoBs(totalEfectivo)}</span>
              {efectivoGuardado && <span className="estado estado--abierta">Guardado en el SIIC</span>}
              <button type="submit" disabled={enCurso === "efectivo"}>
                {enCurso === "efectivo" ? "Guardando..." : efectivoGuardado ? "Actualizar efectivo" : "Guardar efectivo"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className={`paso${tieneDocumentoManual ? " paso--hecho" : ""}`}>
        <span className="paso__numero">{tieneDocumentoManual ? <Icono nombre="check" tamano={18} /> : 2}</span>
        <div>
          <h3 className="paso__titulo">
            <Icono nombre="documento" /> Revisa los documentos del día
          </h3>
          <p className="detalle-fecha">Los cobros con QR se registran solos. Agrega acá cheques, depósitos o tarjetas que hayas recibido.</p>
          <table className="tabla">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Banco</th>
                <th>Número</th>
                <th>Fecha</th>
                <th>Importe</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {datos.documentos.length === 0 && (
                <tr>
                  <td colSpan={6} className="detalle-fecha">
                    Todavía no hay documentos. Al guardar el efectivo aparece acá.
                  </td>
                </tr>
              )}
              {datos.documentos.map((d) => (
                <tr key={`${d.lote}-${d.indice}`}>
                  <td>
                    <span className={claseEnte(d.ente)}>
                      <Icono nombre={d.ente === "EFECTIVO" ? "billete" : d.ente === "PAGO POR QR" ? "qr" : "documento"} tamano={14} />
                      {d.ente}
                    </span>
                  </td>
                  <td>{d.ente === "EFECTIVO" ? "—" : d.banco}</td>
                  <td>{d.numero || "—"}</td>
                  <td>{fechaCorta(d.fecha_vencimiento) || fechaCorta(d.fecha_registro) || "—"}</td>
                  <td className="sin-corte">
                    <strong>Bs. {formatoBs(aCentavos(d.importe))}</strong>
                  </td>
                  <td>
                    {d.editable && (
                      <button className="boton-secundario" onClick={() => corregir(d)}>
                        Corregir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <form className="filtros documento-nuevo" onSubmit={onGuardarDocumento}>
            <label>
              Tipo
              <select required value={documento.ente_id} onChange={(e) => setDocumento({ ...documento, ente_id: e.target.value })}>
                <option value="">Elige</option>
                {datos.entes?.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.descripcion}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Banco
              <select required value={documento.banco_id} onChange={(e) => setDocumento({ ...documento, banco_id: e.target.value })}>
                <option value="">Elige</option>
                {datos.bancos?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.descripcion}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Número
              <input required maxLength={20} value={documento.numero} onChange={(e) => setDocumento({ ...documento, numero: e.target.value })} />
            </label>
            <label>
              Importe (Bs.)
              <input
                required
                inputMode="decimal"
                value={documento.importe}
                onChange={(e) => setDocumento({ ...documento, importe: e.target.value.replace(/[^0-9.,]/g, "") })}
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
            <button type="submit" disabled={enCurso === "documento"}>
              {documento.indice ? "Guardar corrección" : "+ Agregar documento"}
            </button>
            {documento.indice && (
              <button type="button" className="boton-secundario" onClick={() => setDocumento(DOCUMENTO_VACIO)}>
                Cancelar
              </button>
            )}
          </form>
        </div>
      </div>

      <div className="paso">
        <span className="paso__numero">3</span>
        <div>
          <h3 className="paso__titulo">
            <Icono nombre="candado" /> Cierra la caja
          </h3>
          {!efectivoGuardado && <p className="aviso">Primero guarda el efectivo contado (aunque sea Bs. 0).</p>}
          <label className="cierre__observacion">
            Observación (opcional)
            <input
              maxLength={255}
              placeholder="Ej.: faltó cambio en monedas"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </label>
          {confirmando ? (
            <div className="cierre__confirmar">
              <Icono nombre="alerta" />
              <span>Al cerrar ya no podrás cobrar hoy con esta caja. ¿Cerrar?</span>
              <button className="boton-peligro" disabled={enCurso === "cerrar"} onClick={onCerrar}>
                {enCurso === "cerrar" ? "Cerrando..." : "Sí, cerrar caja"}
              </button>
              <button className="boton-secundario" disabled={enCurso === "cerrar"} onClick={() => setConfirmando(false)}>
                Volver
              </button>
            </div>
          ) : (
            <div className="acciones">
              <button disabled={!efectivoGuardado || datos.qr_sin_confirmar > 0} onClick={() => setConfirmando(true)}>
                Cerrar caja
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
