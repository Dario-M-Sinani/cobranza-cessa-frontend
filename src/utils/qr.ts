// Cómo se muestra cada estado de un QR del panel (lista, reportes).
export const ETIQUETAS_ESTADO_QR: Record<string, string> = {
  generado: "Generado",
  pendiente_confirmacion: "Esperando pago",
  pagado: "Pagado",
  vencido: "Vencido",
  error: "Error",
  cancelado: "Anulado",
};
