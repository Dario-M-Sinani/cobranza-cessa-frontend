// Cuentas de caja en centavos enteros: con decimales de JS, 0.1 + 0.2 no da 0.3.

export function aCentavos(valor: string | number | null | undefined): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  const numero = Number(String(valor).trim().replace(",", "."));
  return Number.isFinite(numero) ? Math.round(numero * 100) : 0;
}

export function formatoBs(centavos: number): string {
  return (centavos / 100).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Lo que espera la API: "123.40".
export function aDecimal(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

// "20260811" → "11/08/2026".
export function fechaCorta(yyyymmdd: string | undefined): string {
  if (!yyyymmdd || !/^\d{8}$/.test(yyyymmdd) || yyyymmdd === "00000000") return "—";
  return `${yyyymmdd.slice(6)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(0, 4)}`;
}

// Billetes y monedas en circulación en Bolivia, de mayor a menor (en centavos).
const DENOMINACIONES = [20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10];

export interface PiezaVuelto {
  centavos: number;
  cantidad: number;
  esBillete: boolean;
}

// Cómo armar el vuelto con la menor cantidad de piezas. `resto` = centavos que
// no se pueden dar con monedas (menos de 10 ctvs.).
export function desgloseVuelto(centavos: number): { piezas: PiezaVuelto[]; resto: number } {
  const piezas: PiezaVuelto[] = [];
  let pendiente = Math.max(0, centavos);
  for (const valor of DENOMINACIONES) {
    const cantidad = Math.floor(pendiente / valor);
    if (cantidad > 0) {
      piezas.push({ centavos: valor, cantidad, esBillete: valor >= 1000 });
      pendiente -= cantidad * valor;
    }
  }
  return { piezas, resto: pendiente };
}

// Montos con los que es probable que pague el cliente: el exacto y los
// redondeos hacia arriba a 10, 20, 50, 100 y 200.
export function sugerenciasDePago(totalCentavos: number): number[] {
  if (totalCentavos <= 0) return [];
  const redondeos = [1000, 2000, 5000, 10000, 20000].map((paso) => Math.ceil(totalCentavos / paso) * paso);
  return [...new Set([totalCentavos, ...redondeos])].filter((v) => v >= totalCentavos).sort((a, b) => a - b).slice(0, 5);
}
