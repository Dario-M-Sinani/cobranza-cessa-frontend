import { useEffect, useState } from "react";
import { obtenerCotizacionDolar, type CotizacionDolar } from "../api/cobranza";
import { aCentavos, formatoBs } from "../utils/dinero";

/**
 * La cotización del dólar de hoy en el SIIC (con la que el cierre convierte los $us). Si todavía no
 * está cargada, avisa: la caja no va a poder cerrar hasta que la carguen. Si falla, no muestra nada:
 * es un dato de apoyo, no tiene que trabar el cobro.
 */
/** `discreto`: chico, sin fondo, en la esquina inferior derecha de la pantalla (Cobrar y Caja). */
export function ChipDolar({ texto = "Dólar hoy (SIIC)", discreto = false }: { texto?: string; discreto?: boolean }) {
  const [datos, setDatos] = useState<CotizacionDolar | null>(null);

  useEffect(() => {
    let vigente = true;
    obtenerCotizacionDolar()
      .then((d) => vigente && setDatos(d))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, []);

  if (!datos) return null;
  if (datos.siic) {
    return (
      <span className={`chip-dolar${discreto ? " chip-dolar--discreto" : ""}`} title={datos.bcb ? `Oficial BCB: Bs ${formatoBs(aCentavos(datos.bcb))}` : undefined}>
        {texto}: <strong>Bs {formatoBs(aCentavos(datos.siic))}</strong>
      </span>
    );
  }
  if (datos.alertas.some((a) => a.tipo === "sin_siic")) {
    return <span className={`chip-dolar chip-dolar--alerta${discreto ? " chip-dolar--discreto" : ""}`}>Sin cotización del dólar en el SIIC hoy</span>;
  }
  return null;
}
