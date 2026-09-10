import { apiFetch } from "./client";
import type { Rol, UsuarioAdmin } from "./types";

export function listarUsuarios() {
  return apiFetch<UsuarioAdmin[]>("/usuarios/");
}

export interface NuevoUsuario {
  username: string;
  password: string;
  rol: Rol;
  first_name?: string;
  last_name?: string;
  email?: string;
}

export function crearUsuario(datos: NuevoUsuario) {
  return apiFetch<UsuarioAdmin>("/usuarios/", { method: "POST", body: datos });
}

export function actualizarUsuario(id: number, cambios: Partial<Pick<UsuarioAdmin, "rol" | "activo" | "is_active">>) {
  return apiFetch<UsuarioAdmin>(`/usuarios/${id}/`, { method: "PATCH", body: cambios });
}

export function resetearPassword(id: number, passwordNueva: string) {
  return apiFetch<UsuarioAdmin>(`/usuarios/${id}/`, { method: "PATCH", body: { password: passwordNueva } });
}

// Reseteo acotado a cajeros -- lo puede usar un supervisor (o admin) sin
// necesitar el ID interno ni permiso de gestión de usuarios completo.
export function resetearPasswordCajero(username: string, passwordNueva: string) {
  return apiFetch<void>("/usuarios/resetear-password-cajero/", {
    method: "POST",
    body: { username, password: passwordNueva },
  });
}
