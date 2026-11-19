import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { login as loginRequest, logout as logoutStorage, sesionDesdeToken, type SesionUsuario } from "../api/auth";
import { clearTokens, getAccessToken } from "../api/client";

/**
 * Cierre por inactividad, como la app Java (30 minutos sin uso). La hora de la última actividad se
 * guarda en localStorage: la comparten todas las pestañas y sobrevive a cerrar el navegador, así que al
 * volver a abrirlo después de media hora tampoco queda la sesión abierta.
 */
export const INACTIVIDAD_MS = 30 * 60 * 1000;
const ACTIVIDAD_KEY = "cobranza_actividad";
const MOTIVO_KEY = "cobranza_motivo_salida";
const ANOTAR_CADA_MS = 15 * 1000;
const REVISAR_CADA_MS = 30 * 1000;
const EVENTOS = ["mousemove", "mousedown", "keydown", "touchstart", "wheel"] as const;

function leerActividad(): number {
  try {
    return Number(localStorage.getItem(ACTIVIDAD_KEY)) || 0;
  } catch {
    return 0;
  }
}

function anotarActividad(): void {
  try {
    localStorage.setItem(ACTIVIDAD_KEY, String(Date.now()));
  } catch {
    // sin localStorage la sesión tampoco se guarda: no hay nada que vigilar
  }
}

function inactiva(): boolean {
  const ultima = leerActividad();
  return ultima > 0 && Date.now() - ultima > INACTIVIDAD_MS;
}

/** Por qué se cerró la última sesión (para avisarlo en el login); se lee una sola vez. */
export function motivoDeSalida(): string | null {
  try {
    const motivo = sessionStorage.getItem(MOTIVO_KEY);
    sessionStorage.removeItem(MOTIVO_KEY);
    return motivo;
  } catch {
    return null;
  }
}

interface AuthContextValue {
  sesion: SesionUsuario | null;
  cargando: boolean;
  login: (username: string, password: string) => Promise<SesionUsuario>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<SesionUsuario | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      if (inactiva()) {
        clearTokens();
        try {
          sessionStorage.setItem(MOTIVO_KEY, "inactividad");
        } catch {
          // solo es el aviso
        }
      } else {
        try {
          setSesion(sesionDesdeToken(token));
          anotarActividad();
        } catch {
          clearTokens();
        }
      }
    }
    setCargando(false);
  }, []);

  // Con sesión abierta: se anota la actividad (como mucho cada 15 s) y cada 30 s se revisa si pasó el
  // límite. Otra pestaña con actividad mantiene viva la sesión de todas.
  useEffect(() => {
    if (!sesion) return;
    let ultimaAnotada = 0;
    const alUsar = () => {
      const ahora = Date.now();
      if (ahora - ultimaAnotada > ANOTAR_CADA_MS) {
        ultimaAnotada = ahora;
        anotarActividad();
      }
    };
    const revisar = () => {
      if (!inactiva()) return;
      logoutStorage();
      try {
        sessionStorage.setItem(MOTIVO_KEY, "inactividad");
      } catch {
        // solo es el aviso
      }
      setSesion(null);
    };
    EVENTOS.forEach((e) => window.addEventListener(e, alUsar, { passive: true }));
    const reloj = window.setInterval(revisar, REVISAR_CADA_MS);
    window.addEventListener("focus", revisar);
    return () => {
      EVENTOS.forEach((e) => window.removeEventListener(e, alUsar));
      window.clearInterval(reloj);
      window.removeEventListener("focus", revisar);
    };
  }, [sesion]);

  async function login(username: string, password: string) {
    const nuevaSesion = await loginRequest(username, password);
    anotarActividad();
    setSesion(nuevaSesion);
    return nuevaSesion;
  }

  function logout() {
    logoutStorage();
    setSesion(null);
  }

  return <AuthContext.Provider value={{ sesion, cargando, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
