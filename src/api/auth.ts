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
  nombre: string;
  // Su caja es una caja del SIIC (usuario de la Nest de cobranzas): se abre con agencia y monto inicial.
  cajaSiic: boolean;
  // "nest": entra con su usuario del sistema de cobranzas (clave del SIIC); "local": usuario del panel.
  origen: "nest" | "local";
}

function decodePayload(token: string): Record<string, unknown> {
  const [, payload] = token.split(".");
  const binario = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  // atob da bytes: sin esto, un nombre con Ñ o tilde llega roto.
  const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function sesionDesdeToken(access: string): SesionUsuario {
  const payload = decodePayload(access);
  return {
    username: String(payload.username ?? ""),
    rol: payload.rol as Rol,
    activo: Boolean(payload.activo),
    soloConsulta: payload.solo_consulta === true,
    nombre: String(payload.nombre ?? payload.username ?? ""),
    cajaSiic: payload.caja_siic === true,
    origen: payload.origen === "nest" ? "nest" : "local",
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
