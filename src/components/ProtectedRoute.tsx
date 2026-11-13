import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import type { Rol } from "../api/types";
import { useAuth } from "../context/AuthContext";

interface Props {
  children: ReactNode;
  rolesPermitidos?: Rol[];
  // Pantallas de cobro/caja: en el panel solo consulta (prod) se va a Pagos web.
  esDeCobro?: boolean;
}

export function ProtectedRoute({ children, rolesPermitidos, esDeCobro }: Props) {
  const { sesion, cargando } = useAuth();

  if (cargando) return <p className="pagina">Cargando...</p>;
  if (!sesion) return <Navigate to="/login" replace />;
  if (esDeCobro && sesion.soloConsulta) return <Navigate to="/pagos-web" replace />;
  if (rolesPermitidos && !rolesPermitidos.includes(sesion.rol)) {
    return <p className="pagina mensaje-error">No tienes permiso para ver esta página.</p>;
  }
  return <>{children}</>;
}
