import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const sesion = await login(username, password);
      // La cajera arranca en Cobrar; supervisor/admin y el panel de solo consulta, en Pagos web.
      const cobra = sesion.rol === "cajera" && !sesion.soloConsulta;
      navigate(cobra ? "/deuda" : "/pagos-web");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "Usuario o contraseña incorrectos."
          : "No se pudo conectar con el servidor."
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="pantalla-login">
      <form className="tarjeta" onSubmit={onSubmit}>
        <img className="logo-cessa logo-cessa--claro login__logo" src="/logo-cessa.png" alt="CESSA" />
        <img className="logo-cessa logo-cessa--oscuro login__logo" src="/logo-cessa-blanco.png" alt="CESSA" />
        <h1 className="login__titulo">Cobranza CESSA</h1>
        <label>
          Usuario
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
        </label>
        <label>
          Contraseña
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="mensaje-error">{error}</p>}
        <button type="submit" disabled={enviando}>
          {enviando ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
