# Cobranza CESSA -- Frontend

SPA React + TypeScript (Vite) para el panel de cobranza CESSA. Consume la API
del backend Django en `../cobranza_cessa/` vía REST + JWT. Repo separado a
propósito (ver ese proyecto para el contexto completo).

## Setup local

```bash
npm install
cp .env.example .env   # ajustar VITE_API_BASE_URL si el backend no corre en :8001
npm run dev            # http://localhost:5174
```

El backend debe correr en un puerto distinto al de `cessa-laravel` (que usa
`:8000`) y tener `CORS_ALLOWED_ORIGINS=http://localhost:5174` en su `.env`.

## Estructura

```
src/
├── api/
│   ├── client.ts      # fetch con manejo de access/refresh token (JWT)
│   ├── auth.ts         # login/logout, decodifica rol/username del JWT
│   ├── cobranza.ts     # llamadas a /deudas, /transacciones-qr, /facturas
│   └── types.ts
├── context/AuthContext.tsx
├── components/         # NavBar, ProtectedRoute
└── pages/               # LoginPage, ConsultaDeudaPage, TransaccionesPage
```

## Autenticación

El access token (JWT) trae `rol`/`activo`/`username` como claims custom (ver
`TokenObtainPairConRolSerializer` en el backend) -- el frontend los lee
decodificando el token, sin pegarle a otro endpoint. Los tokens se guardan en
`localStorage`; en un `401` se intenta refrescar una vez antes de forzar
logout.

## Estado actual / próximos pasos

Cubre el flujo de cajera (consultar deuda, generar QR, ver transacciones
propias) y supervisor/admin (ver todo, reintentar facturación). Pendiente:
gestión de usuarios en la UI (hoy se hace desde el admin de Django),
visualización del QR generado (hoy solo se genera y se navega al listado),
manejo de roles con 2FA cuando se agregue del lado del backend.
