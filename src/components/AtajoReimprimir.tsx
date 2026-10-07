import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { obtenerUltimoComprobante } from "../api/cobranza";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { EVENTO_REIMPRIMIR } from "../utils/reimprimir";

/**
 * F9 en cualquier pantalla: abre el comprobante del último cobro del usuario y lanza la
 * impresión. El último se pide al backend, así funciona aunque se haya recargado la
 * página o se cambie de computadora.
 */
export function AtajoReimprimir() {
  const { sesion } = useAuth();
  const navigate = useNavigate();
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    if (!sesion) return;
    let ocupado = false;

    async function reimprimir() {
      if (ocupado) return;
      ocupado = true;
      try {
        const { tipo, id } = await obtenerUltimoComprobante();
        navigate(`/comprobante/${tipo}/${id}?imprimir=1`);
      } catch (err) {
        setMensaje(err instanceof ApiError ? err.message : "No se pudo obtener el último comprobante.");
        setTimeout(() => setMensaje(null), 4000);
      } finally {
        ocupado = false;
      }
    }

    function alPresionar(e: KeyboardEvent) {
      if (e.key === "F9") {
        e.preventDefault();
        reimprimir();
      }
    }

    window.addEventListener("keydown", alPresionar);
    window.addEventListener(EVENTO_REIMPRIMIR, reimprimir);
    return () => {
      window.removeEventListener("keydown", alPresionar);
      window.removeEventListener(EVENTO_REIMPRIMIR, reimprimir);
    };
  }, [sesion, navigate]);

  return mensaje ? (
    <div className="toast" role="status">
      {mensaje}
    </div>
  ) : null;
}
