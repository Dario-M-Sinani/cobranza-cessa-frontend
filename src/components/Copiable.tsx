import { useState } from "react";

/** Texto que se copia al portapapeles con un clic (sin abrir ni cerrar la fila de la tabla). */
export function Copiable({ texto, children }: { texto: string; children?: React.ReactNode }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Sin permiso de portapapeles (o http): el método viejo.
      const campo = document.createElement("textarea");
      campo.value = texto;
      document.body.appendChild(campo);
      campo.select();
      document.execCommand("copy");
      campo.remove();
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  return (
    <button type="button" className="copiable" onClick={copiar} title={`Copiar ${texto}`}>
      {children ?? texto}
      <span className="copiable__aviso">{copiado ? "✓ copiado" : "⧉"}</span>
    </button>
  );
}
