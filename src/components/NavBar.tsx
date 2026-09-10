import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../hooks/useTheme";
import { ThemeIcon } from "./ThemeIcon";

export function NavBar() {
  const { sesion, logout } = useAuth();
  const navigate = useNavigate();
  const { tema, alternar } = useTheme();

  function salir() {
    logout();
    navigate("/login");
  }

  return (
    <nav className="navbar">
      <div className="navbar__marca">Cobranza CESSA</div>
      {sesion && (
        <div className="navbar__links">
          <Link to="/deuda">Consultar deuda</Link>
          <Link to="/transacciones">Transacciones</Link>
          <Link to="/caja">Caja</Link>
          {(sesion.rol === "supervisor" || sesion.rol === "admin") && (
            <Link to="/dashboard">Dashboard</Link>
          )}
          {sesion.rol === "admin" && (
            <>
              <Link to="/usuarios">Usuarios</Link>
              <Link to="/auditoria">Auditoría</Link>
            </>
          )}
        </div>
      )}
      <div className="navbar__usuario">
        <button
          className="theme-toggle"
          onClick={alternar}
          aria-label="Cambiar tema claro/oscuro"
          title="Cambiar tema claro/oscuro"
        >
          <ThemeIcon tema={tema} />
        </button>
        {sesion && (
          <>
            <span>
              {sesion.username} · {sesion.rol}
            </span>
            <button onClick={salir}>Salir</button>
          </>
        )}
      </div>
    </nav>
  );
}
