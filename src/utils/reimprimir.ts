// Evento para pedir la reimpresión del último comprobante desde un botón (la tecla F9 la
// atiende AtajoReimprimir, que también escucha este evento).
export const EVENTO_REIMPRIMIR = "reimprimir-ultimo-comprobante";

export function reimprimirUltimo() {
  window.dispatchEvent(new Event(EVENTO_REIMPRIMIR));
}
