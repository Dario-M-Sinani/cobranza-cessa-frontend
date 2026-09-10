import { useEffect, useState, type FormEvent } from "react";
import { actualizarUsuario, crearUsuario, listarUsuarios, resetearPassword } from "../api/usuarios";
import { ApiError } from "../api/client";
import type { Rol, UsuarioAdmin } from "../api/types";

const ETIQUETAS_ROL: Record<Rol, string> = {
  cajera: "Cajero/a",
  supervisor: "Supervisor",
  admin: "Administrador",
};

export function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accionEnCurso, setAccionEnCurso] = useState<number | "nuevo" | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<Rol>("cajera");

  const [passwordsReset, setPasswordsReset] = useState<Record<number, string>>({});
  const [confirmacionReset, setConfirmacionReset] = useState<number | null>(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      setUsuarios(await listarUsuarios());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar la lista de usuarios.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function onCrear(evento: FormEvent) {
    evento.preventDefault();
    setAccionEnCurso("nuevo");
    setError(null);
    try {
      await crearUsuario({ username, password, rol });
      setUsername("");
      setPassword("");
      setRol("cajera");
      await cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el usuario.");
    } finally {
      setAccionEnCurso(null);
    }
  }

  async function onCambiarRol(usuario: UsuarioAdmin, nuevoRol: Rol) {
    setAccionEnCurso(usuario.id);
    setError(null);
    try {
      await actualizarUsuario(usuario.id, { rol: nuevoRol });
      await cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar el rol.");
    } finally {
      setAccionEnCurso(null);
    }
  }

  async function onAlternarActivo(usuario: UsuarioAdmin) {
    setAccionEnCurso(usuario.id);
    setError(null);
    try {
      await actualizarUsuario(usuario.id, { activo: !usuario.activo });
      await cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar el estado.");
    } finally {
      setAccionEnCurso(null);
    }
  }

  async function onResetearPassword(usuario: UsuarioAdmin) {
    const nueva = passwordsReset[usuario.id];
    if (!nueva || nueva.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setAccionEnCurso(usuario.id);
    setError(null);
    setConfirmacionReset(null);
    try {
      await resetearPassword(usuario.id, nueva);
      setPasswordsReset((prev) => ({ ...prev, [usuario.id]: "" }));
      setConfirmacionReset(usuario.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo resetear la contraseña.");
    } finally {
      setAccionEnCurso(null);
    }
  }

  return (
    <div className="pagina">
      <div className="pagina__encabezado">
        <h1>Usuarios</h1>
      </div>

      <div className="tarjeta tarjeta--ancha">
        <h2 className="tarjeta__titulo">Crear usuario</h2>
        <form className="formulario-inline" onSubmit={onCrear}>
          <input
            placeholder="Usuario"
            value={username}
            onChange={(evento) => setUsername(evento.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(evento) => setPassword(evento.target.value)}
            minLength={8}
            required
          />
          <select value={rol} onChange={(evento) => setRol(evento.target.value as Rol)}>
            <option value="cajera">Cajero/a</option>
            <option value="supervisor">Supervisor</option>
            <option value="admin">Administrador</option>
          </select>
          <button type="submit" disabled={accionEnCurso === "nuevo"}>
            {accionEnCurso === "nuevo" ? "Creando..." : "Crear"}
          </button>
        </form>
      </div>

      {error && <p className="mensaje-error">{error}</p>}

      {cargando ? (
        <p>Cargando...</p>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Activo</th>
              <th>Acciones</th>
              <th>Resetear contraseña</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>
                  <select
                    value={u.rol}
                    disabled={accionEnCurso === u.id}
                    onChange={(evento) => onCambiarRol(u, evento.target.value as Rol)}
                  >
                    <option value="cajera">{ETIQUETAS_ROL.cajera}</option>
                    <option value="supervisor">{ETIQUETAS_ROL.supervisor}</option>
                    <option value="admin">{ETIQUETAS_ROL.admin}</option>
                  </select>
                </td>
                <td>
                  <span className={`estado estado--${u.activo ? "abierta" : "cerrada"}`}>
                    {u.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="acciones">
                  <button disabled={accionEnCurso === u.id} onClick={() => onAlternarActivo(u)}>
                    {u.activo ? "Desactivar" : "Activar"}
                  </button>
                </td>
                <td className="acciones">
                  <input
                    type="password"
                    placeholder="Nueva contraseña"
                    value={passwordsReset[u.id] ?? ""}
                    onChange={(evento) =>
                      setPasswordsReset((prev) => ({ ...prev, [u.id]: evento.target.value }))
                    }
                  />
                  <button disabled={accionEnCurso === u.id} onClick={() => onResetearPassword(u)}>
                    Resetear
                  </button>
                  {confirmacionReset === u.id && <span className="detalle-fecha">Actualizada</span>}
                </td>
              </tr>
            ))}
            {usuarios.length === 0 && (
              <tr>
                <td colSpan={5}>No hay usuarios todavía.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
