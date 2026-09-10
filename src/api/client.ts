const BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

const ACCESS_KEY = "cobranza_access";
const REFRESH_KEY = "cobranza_refresh";

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Evita disparar varios refresh en paralelo si varias llamadas pegan un 401
// al mismo tiempo (ej. la carga inicial de una página con varios fetch).
let refreshingPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;

  const response = await fetch(`${BASE_URL}/auth/token/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!response.ok) {
    clearTokens();
    return null;
  }
  const data = await response.json();
  localStorage.setItem(ACCESS_KEY, data.access);
  return data.access as string;
}

interface ApiFetchOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
  headers?: Record<string, string>;
}

// Compartido por apiFetch (JSON) y apiFetchBlob (descargas, ej. CSV): arma
// la request con el access token, y si la primera respuesta es 401 refresca
// una vez y reintenta.
async function fetchConAuth(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { method = "GET", body, auth = true, headers: headersExtra } = options;

  const doFetch = async (token: string | null) => {
    const headers: Record<string, string> = { "Content-Type": "application/json", ...headersExtra };
    if (auth && token) headers.Authorization = `Bearer ${token}`;

    return fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let response = await doFetch(auth ? getAccessToken() : null);

  if (auth && response.status === 401) {
    if (!refreshingPromise) {
      refreshingPromise = refreshAccessToken().finally(() => {
        refreshingPromise = null;
      });
    }
    const nuevoToken = await refreshingPromise;
    if (nuevoToken) {
      response = await doFetch(nuevoToken);
    }
  }

  return response;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const response = await fetchConAuth(path, options);

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const data = await response.json();
      detail = data.detail ?? JSON.stringify(data);
    } catch {
      // respuesta sin body JSON (ej. 502 de un proxy)
    }
    throw new ApiError(response.status, detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function apiFetchBlob(path: string): Promise<Blob> {
  const response = await fetchConAuth(path);
  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }
  return response.blob();
}
