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
  // Gateway de prod: el panel es solo para ver (Pagos web, Dashboard); cobrar y caja no.
  soloConsulta: boolean;
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
    soloConsulta: payload.solo_consulta === true,
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
