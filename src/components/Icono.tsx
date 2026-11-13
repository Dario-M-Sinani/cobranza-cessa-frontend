// Íconos de línea propios (SVG en línea, sin dependencias). Heredan el color del texto.
const TRAZOS: Record<string, string[]> = {
  caja: ["M3 9h18v11H3z", "M3 9l2-5h14l2 5", "M9 13h6"],
  billete: ["M2 6h20v12H2z", "M12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5", "M6 12h.01", "M18 12h.01"],
  documento: ["M6 2h9l5 5v15H6z", "M14 2v6h6", "M9 13h7", "M9 17h7"],
  candado: ["M5 11h14v10H5z", "M8 11V7a4 4 0 0 1 8 0v4"],
  reloj: ["M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18", "M12 7v5l3 2"],
  agencia: ["M3 21h18", "M5 21V8l7-4l7 4v13", "M9 21v-6h6v6"],
  check: ["M5 12l5 5L20 7"],
  alerta: ["M12 3L2 20h20z", "M12 10v4", "M12 17h.01"],
  pdf: ["M6 2h9l5 5v15H6z", "M14 2v6h6", "M9 15h6", "M12 12v6"],
  qr: ["M3 3h7v7H3z", "M14 3h7v7h-7z", "M3 14h7v7H3z", "M14 14h3v3h-3z", "M18 18h3v3h-3z"],
  balanza: ["M12 3v18", "M5 21h14", "M4 7h16", "M4 7l-3 7a3 3 0 0 0 6 0z", "M20 7l-3 7a3 3 0 0 0 6 0z"],
  usuario: ["M12 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8", "M4 21a8 8 0 0 1 16 0"],
};

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ nombre, tamano = 20, className }: { nombre: NombreIcono; tamano?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {TRAZOS[nombre].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
