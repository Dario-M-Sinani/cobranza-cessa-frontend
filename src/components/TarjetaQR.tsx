import { useEffect, useRef, useState } from "react";
import { ApiError } from "../api/client";
import { cancelarTransaccion, consultarEstadoQR } from "../api/cobranza";
import type { TransaccionQR } from "../api/types";
import { aCentavos, formatoBs } from "../utils/dinero";
import { Icono } from "./Icono";

const CONSULTA_CADA_MS = 3000;

function transcurrido(desde: string, ahora: number): string {
  const segundos = Math.max(0, Math.floor((ahora - new Date(desde).getTime()) / 1000));
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
}

/**
 * QR del mostrador: muestra el código y pregunta cada pocos segundos si el cliente ya pagó (el
 * backend consulta a SIP en el momento). Pagado → imprimir y siguiente. Mientras espera se puede
 * anular: se inhabilita en SIP y, si justo pagó, queda como pagado en vez de anulado.
 */
export function TarjetaQR(props: {
  inicial: TransaccionQR;
  onImprimir: (id: number) => void;
  onSiguiente: () => void;
}) {
  const [imagen] = useState(() => props.inicial.imagen_qr_base64); // la pasarela no la vuelve a dar
  const [qr, setQr] = useState(props.inicial);
  const [ahora, setAhora] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [confirmandoAnular, setConfirmandoAnular] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const siguiente = useRef<HTMLButtonElement>(null);
  const esperando = qr.estado === "generado" || qr.estado === "pendiente_confirmacion";

  useEffect(() => {
    if (!esperando) return;
    const reloj = window.setInterval(() => setAhora(Date.now()), 1000);
    const consulta = window.setInterval(() => {
      consultarEstadoQR(qr.id)
        .then((nuevo) => {
          setQr(nuevo);
          setError(null);
        })
        .catch(() => setError("Sin conexión con el servidor: se sigue intentando."));
    }, CONSULTA_CADA_MS);
    return () => {
      window.clearInterval(reloj);
      window.clearInterval(consulta);
    };
  }, [esperando, qr.id]);

  useEffect(() => {
    if (!esperando) siguiente.current?.focus();
  }, [esperando]);

  async function anular() {
    setAnulando(true);
    setError(null);
    try {
      setQr(await cancelarTransaccion(qr.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo anular el QR.");
    } finally {
      setAnulando(false);
      setConfirmandoAnular(false);
    }
  }

  const monto = `Bs. ${formatoBs(aCentavos(qr.monto_snapshot))}`;

  if (qr.estado === "pagado") {
    return (
      <div className="tarjeta tarjeta-qr resultado qr-estado qr-estado--pagado">
        <div className="qr-estado__sello">
          <Icono nombre="check" tamano={40} />
        </div>
        <p className="resultado__ok">Pago recibido</p>
        <p className="monto">{monto}</p>
        <p className="detalle-fecha">
          {qr.deuda.cliente.nombre} · {qr.deuda.cliente.codigo_externo}
          {qr.factura?.numero_factura ? ` · Factura ${qr.factura.numero_factura}` : " · La factura se registra en el SIIC en un momento"}
        </p>
        <div className="acciones">
          <button className="boton-secundario" onClick={() => props.onImprimir(qr.id)}>
            Imprimir comprobante
          </button>
          <button ref={siguiente} onClick={props.onSiguiente}>
            Siguiente cliente (Enter)
          </button>
        </div>
      </div>
    );
  }

  if (!esperando) {
    const textos: Record<string, string> = {
      cancelado: "QR anulado: el cliente ya no puede pagarlo.",
      vencido: "El QR venció sin pago.",
      error: "La pasarela tuvo un error con este QR.",
    };
    return (
      <div className="tarjeta tarjeta-qr resultado qr-estado">
        <p className="resultado__ok resultado__ok--neutro">{textos[qr.estado] ?? `QR ${qr.estado}`}</p>
        <p className="detalle-fecha">
          {qr.deuda.cliente.nombre} · {monto} · no se cobró nada.
        </p>
        <div className="acciones">
          <button ref={siguiente} onClick={props.onSiguiente}>
            Siguiente cliente (Enter)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tarjeta tarjeta-qr resultado qr-estado">
      <p className="resultado__ok">QR generado</p>
      {imagen ? (
        <img className="qr-imagen" src={`data:image/png;base64,${imagen}`} alt={`Código QR de cobro por ${monto}`} />
      ) : (
        <p className="mensaje-error">La pasarela no devolvió una imagen de QR.</p>
      )}
      <p className="monto">{monto}</p>
      <p className="detalle-fecha">
        {qr.deuda.cliente.nombre} · {qr.deuda.cliente.codigo_externo}
      </p>
      <p className="qr-estado__espera">
        <span className="qr-estado__pulso" aria-hidden="true" />
        Esperando el pago del cliente · {transcurrido(qr.creado_en, ahora)}
      </p>
      <p className="detalle-fecha">El cliente lo escanea desde su banco; esta pantalla se actualiza sola.</p>
      {error && <p className="mensaje-error">{error}</p>}
      {confirmandoAnular ? (
        <div className="cierre__confirmar">
          <span>¿Anular el QR? El cliente ya no podrá pagarlo.</span>
          <button className="boton-peligro" disabled={anulando} onClick={anular}>
            {anulando ? "Anulando..." : "Sí, anular"}
          </button>
          <button className="boton-secundario" disabled={anulando} onClick={() => setConfirmandoAnular(false)}>
            Volver
          </button>
        </div>
      ) : (
        <div className="acciones">
          <button className="boton-secundario boton-anular" onClick={() => setConfirmandoAnular(true)}>
            Anular QR
          </button>
        </div>
      )}
    </div>
  );
}
