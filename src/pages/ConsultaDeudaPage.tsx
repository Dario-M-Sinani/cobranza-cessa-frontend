import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { CobroEfectivo, Deuda, TransaccionQR } from "../api/types";
import { consultarDeuda, generarTransaccionQR, registrarCobroEfectivo } from "../api/cobranza";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";

export function ConsultaDeudaPage() {
  const { sesion } = useAuth();
  const navigate = useNavigate();
  const codigoInputRef = useRef<HTMLInputElement>(null);
  const [codigoExterno, setCodigoExterno] = useState("");
  const [deuda, setDeuda] = useState<Deuda | null>(null);
  const [transaccion, setTransaccion] = useState<TransaccionQR | null>(null);
  const [cobroEfectivo, setCobroEfectivo] = useState<CobroEfectivo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [generando, setGenerando] = useState(false);

  const [montoACobrar, setMontoACobrar] = useState("");
  const [montoRecibido, setMontoRecibido] = useState("");
  const [cobrando, setCobrando] = useState(false);

  function resetearResultados() {
    setCodigoExterno("");
    setDeuda(null);
    setTransaccion(null);
    setCobroEfectivo(null);
    setMontoACobrar("");
    setMontoRecibido("");
    // Cada cobro termina con el foco listo para el próximo cliente -- esto
    // es lo que hace que se sienta como una caja real, no una serie de
    // páginas separadas.
    codigoInputRef.current?.focus();
  }

  async function onConsultar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDeuda(null);
    setTransaccion(null);
    setCobroEfectivo(null);
    setCargando(true);
    try {
      const resultado = await consultarDeuda(codigoExterno);
      setDeuda(resultado);
      // Por defecto se cobra la deuda completa y se asume pago exacto (sin
      // vuelto) -- el cajero solo tipea algo si el cliente paga distinto o
      // pide un adelanto. Menos tipeo para el caso más común.
      setMontoACobrar(resultado.monto);
      setMontoRecibido(resultado.monto);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo consultar la deuda.");
    } finally {
      setCargando(false);
    }
  }

  function onCambiarMontoACobrar(valor: string) {
    setMontoACobrar(valor);
    setMontoRecibido(valor);
  }

  async function onGenerarQR() {
    if (!deuda) return;
    setError(null);
    setTransaccion(null);
    setGenerando(true);
    try {
      setTransaccion(await generarTransaccionQR(deuda.id, montoACobrar));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo generar el QR.");
    } finally {
      setGenerando(false);
    }
  }

  const vueltoCalculado =
    montoACobrar && montoRecibido && !Number.isNaN(Number(montoRecibido))
      ? (Number(montoRecibido) - Number(montoACobrar)).toFixed(2)
      : null;

  async function onConfirmarEfectivo(e: FormEvent) {
    e.preventDefault();
    if (!deuda) return;
    setError(null);
    setCobrando(true);
    try {
      setCobroEfectivo(await registrarCobroEfectivo(deuda.id, montoRecibido, montoACobrar));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar el cobro en efectivo.");
    } finally {
      setCobrando(false);
    }
  }

  const esCajera = sesion?.rol === "cajera";
  const tieneSaldo = deuda !== null && Number(deuda.monto) > 0;

  return (
    <div className="pagina">
      <h1>Consultar deuda</h1>
      <form className="formulario-inline" onSubmit={onConsultar}>
        <input
          ref={codigoInputRef}
          placeholder="Código de cliente"
          value={codigoExterno}
          onChange={(e) => setCodigoExterno(e.target.value)}
          autoFocus
          required
        />
        <button type="submit" disabled={cargando}>
          {cargando ? "Consultando..." : "Consultar"}
        </button>
      </form>

      {error && <p className="mensaje-error">{error}</p>}

      {deuda && !transaccion && !cobroEfectivo && (
        <div className="tarjeta tarjeta--ancha">
          <h2>{deuda.cliente.nombre}</h2>
          <p>Código: {deuda.cliente.codigo_externo}</p>
          <p className="monto">Bs. {deuda.monto}</p>
          <p className="detalle-fecha">Consultado: {new Date(deuda.fecha_consulta).toLocaleString()}</p>

          {!tieneSaldo ? (
            <p className="detalle-fecha">Este cliente no tiene deuda pendiente para cobrar.</p>
          ) : (
            esCajera && (
              <>
                <label>
                  Monto a cobrar (bajalo para cobrar un adelanto)
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={deuda.monto}
                    value={montoACobrar}
                    onChange={(e) => onCambiarMontoACobrar(e.target.value)}
                  />
                </label>

                <div className="cobro-panel">
                  <div className="cobro-panel__opcion">
                    <h3 className="tarjeta__titulo">QR</h3>
                    <button onClick={onGenerarQR} disabled={generando || !montoACobrar}>
                      {generando ? "Generando QR..." : "Generar QR de cobro"}
                    </button>
                  </div>

                  <form className="cobro-panel__opcion" onSubmit={onConfirmarEfectivo}>
                    <h3 className="tarjeta__titulo">Efectivo</h3>
                    <input
                      type="number"
                      step="0.01"
                      min={montoACobrar}
                      placeholder="Monto recibido"
                      value={montoRecibido}
                      onChange={(e) => setMontoRecibido(e.target.value)}
                      required
                    />
                    {vueltoCalculado !== null && (
                      <span className="detalle-fecha">Vuelto: Bs. {vueltoCalculado}</span>
                    )}
                    <button type="submit" disabled={cobrando || !montoACobrar}>
                      {cobrando ? "Registrando..." : "Confirmar cobro en efectivo"}
                    </button>
                  </form>
                </div>
              </>
            )
          )}
        </div>
      )}

      {transaccion && (
        <div className="tarjeta tarjeta-qr">
          <h2>QR de cobro generado</h2>
          {transaccion.imagen_qr_base64 ? (
            <img
              className="qr-imagen"
              src={`data:image/png;base64,${transaccion.imagen_qr_base64}`}
              alt={`Código QR de cobro por Bs. ${transaccion.monto_snapshot}`}
            />
          ) : (
            <p className="mensaje-error">La pasarela no devolvió una imagen de QR.</p>
          )}
          <p className="monto">Bs. {transaccion.monto_snapshot}</p>
          {Number(transaccion.monto_snapshot) < Number(transaccion.deuda.monto) && (
            <p className="detalle-fecha">
              Adelanto — queda pendiente Bs.{" "}
              {(Number(transaccion.deuda.monto) - Number(transaccion.monto_snapshot)).toFixed(2)}
            </p>
          )}
          <p className="detalle-fecha">Esperando que el cliente escanee y pague.</p>
          <div className="acciones">
            <button onClick={() => navigate("/transacciones")}>Ir a transacciones</button>
            <button onClick={resetearResultados}>Siguiente cliente</button>
          </div>
        </div>
      )}

      {cobroEfectivo && (
        <div className="tarjeta tarjeta-qr">
          <h2>Cobro en efectivo registrado</h2>
          <p className="monto">Bs. {cobroEfectivo.monto_snapshot}</p>
          <p>Recibido: Bs. {cobroEfectivo.monto_recibido}</p>
          <p>Vuelto: Bs. {cobroEfectivo.vuelto}</p>
          {Number(cobroEfectivo.monto_snapshot) < Number(cobroEfectivo.deuda.monto) && (
            <p className="detalle-fecha">
              Adelanto — queda pendiente Bs.{" "}
              {(Number(cobroEfectivo.deuda.monto) - Number(cobroEfectivo.monto_snapshot)).toFixed(2)}
            </p>
          )}
          <p className="detalle-fecha">
            Factura {cobroEfectivo.factura?.estado_envio ?? "no generada"}.
          </p>
          <div className="acciones">
            <button onClick={() => navigate(`/comprobante/efectivo/${cobroEfectivo.id}`)}>
              Ver / imprimir comprobante
            </button>
            <button onClick={resetearResultados}>Siguiente cliente</button>
          </div>
        </div>
      )}
    </div>
  );
}
