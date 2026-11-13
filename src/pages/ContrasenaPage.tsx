import { useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "../api/client";
import { Icono } from "../components/Icono";
import { useAuth } from "../context/AuthContext";

/** Cambio de la contraseña propia. Para un usuario del sistema de cobranzas es la misma con la que
 * entra al SIIC: se cambia allá y se cierran sus otras sesiones. */
export function ContrasenaPage() {
  const { sesion } = useAuth();
  const minimo = sesion?.origen === "nest" ? 6 : 8;
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  async function onGuardar(evento: FormEvent) {
    evento.preventDefault();
    if (nueva !== repetida) {
      setError("Las dos contraseñas nuevas no coinciden.");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await apiFetch("/cambiar-contrasena/", { method: "POST", body: { actual, nueva } });
      setListo(true);
      setActual("");
      setNueva("");
      setRepetida("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar la contraseña.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="pagina">
      <div className="pagina__encabezado">
        <h1>Mi contraseña</h1>
      </div>
      <form className="tarjeta" onSubmit={onGuardar}>
        <h2 className="tarjeta__titulo">
          <Icono nombre="candado" /> Cambiar contraseña de {sesion?.username}
        </h2>
        {listo && (
          <p className="mensaje-ok">
            <Icono nombre="check" tamano={16} /> Contraseña cambiada. Úsala la próxima vez que entres.
          </p>
        )}
        {error && <p className="mensaje-error">{error}</p>}
        <label>
          Contraseña actual
          <input type="password" required autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} />
        </label>
        <label>
          Contraseña nueva
          <input
            type="password"
            required
            minLength={minimo}
            autoComplete="new-password"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
          />
        </label>
        <label>
          Repite la contraseña nueva
          <input
            type="password"
            required
            minLength={minimo}
            autoComplete="new-password"
            value={repetida}
            onChange={(e) => setRepetida(e.target.value)}
          />
        </label>
        <p className="detalle-fecha">Al menos {minimo} caracteres. Las demás sesiones abiertas con tu usuario se cierran.</p>
        <button type="submit" disabled={enviando}>
          {enviando ? "Guardando..." : "Cambiar contraseña"}
        </button>
      </form>
    </div>
  );
}
