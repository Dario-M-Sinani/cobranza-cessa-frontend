import { apiFetch, clearTokens, setTokens } from "./client";
import type { Rol } from "./types";

interface TokenPairResponse {
  access: string;
  refresh: string;
}

export interface SesionUsuario {
  username: string;
  rol: Rol;
  activo: boolean;
}

function decodePayload(token: string): Record<string, unknown> {
  const [, payload] = token.split(".");
  const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(json);
}

export function sesionDesdeToken(access: string): SesionUsuario {
  const payload = decodePayload(access);
  return {
    username: String(payload.username ?? ""),
    rol: payload.rol as Rol,
    activo: Boolean(payload.activo),
  };
}

export async function login(username: string, password: string): Promise<SesionUsuario> {
  const data = await apiFetch<TokenPairResponse>("/auth/token/", {
    method: "POST",
    body: { username, password },
    auth: false,
  });
  setTokens(data.access, data.refresh);
  return sesionDesdeToken(data.access);
}

export function logout() {
  clearTokens();
}
