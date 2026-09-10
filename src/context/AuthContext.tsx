import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { login as loginRequest, logout as logoutStorage, sesionDesdeToken, type SesionUsuario } from "../api/auth";
import { clearTokens, getAccessToken } from "../api/client";

interface AuthContextValue {
  sesion: SesionUsuario | null;
  cargando: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<SesionUsuario | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      try {
        setSesion(sesionDesdeToken(token));
      } catch {
        clearTokens();
      }
    }
    setCargando(false);
  }, []);

  async function login(username: string, password: string) {
    const nuevaSesion = await loginRequest(username, password);
    setSesion(nuevaSesion);
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
