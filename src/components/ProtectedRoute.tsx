import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import type { Rol } from "../api/types";
import { useAuth } from "../context/AuthContext";

interface Props {
  children: ReactNode;
  rolesPermitidos?: Rol[];
}

export function ProtectedRoute({ children, rolesPermitidos }: Props) {
  const { sesion, cargando } = useAuth();

  if (cargando) return <p className="pagina">Cargando...</p>;
  if (!sesion) return <Navigate to="/login" replace />;
  if (rolesPermitidos && !rolesPermitidos.includes(sesion.rol)) {
    return <p className="pagina mensaje-error">No tenés permiso para ver esta página.</p>;
  }
  return <>{children}</>;
}
