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
      await login(username, password);
      navigate("/transacciones");
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
        <h1>Cobranza CESSA</h1>
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
