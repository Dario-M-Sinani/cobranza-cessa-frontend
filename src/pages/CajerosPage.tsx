import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  actualizarCajero,
  crearCajero,
  DIAS,
  listarCajeros,
  obtenerCajero,
  type CajeroResumen,
  type Dia,
  type Entidad,
  type FichaCajero,
  type RolNest,
} from "../api/cajeros";
import { ApiError } from "../api/client";
import { Icono } from "../components/Icono";
import { TransaccionesCajero } from "../components/TransaccionesCajero";
import { useAuth } from "../context/AuthContext";

const ROLES: { valor: RolNest; etiqueta: string }[] = [
  { valor: "CAJA", etiqueta: "Cajero" },
  { valor: "COBRANZA", etiqueta: "Supervisor de cobranza" },
  { valor: "ENTIDAD_FINANCIERA", etiqueta: "Responsable de entidad" },
  { valor: "SISTEMAS", etiqueta: "Sistemas" },
];

const ETIQUETA_DIA: Record<Dia, string> = {
  lunes: "Lun", martes: "Mar", miercoles: "Mié", jueves: "Jue", viernes: "Vie", sabado: "Sáb", domingo: "Dom",
};

function hoyMasDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fichaNueva(entidadId: number): FichaCajero {
  return {
    username: "",
    nombre: "",
    rol: "CAJA",
    habilitado: true,
    entidad_financiera_id: entidadId,
    hora_inicial: "08:00",
    hora_final: "18:00",
    habilitacion_inicio: hoyMasDias(0),
    habilitacion_fin: hoyMasDias(365),
    dias: { lunes: true, martes: true, miercoles: true, jueves: true, viernes: true, sabado: false, domingo: false },
    password: "",
  };
}

/**
 * Cajeros de la Nest de cobranzas, de CESSA y de los bancos (como "Usuarios" de la app Java).
 * Supervisor: ve la lista y la ficha. Admin (SISTEMAS): además crea (alta en la Nest y en el SIIC a la
 * vez), edita y habilita o deshabilita.
 */
export function CajerosPage() {
  const { sesion } = useAuth();
  const esAdmin = sesion?.rol === "admin";
  const [cajeros, setCajeros] = useState<CajeroResumen[]>([]);
  const [entidades, setEntidades] = useState<Entidad[]>([]);
  const [entidad, setEntidad] = useState(0);
  const [busqueda, setBusqueda] = useState("");
  const [soloConCaja, setSoloConCaja] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  // Ficha abierta: "nuevo" o la de un cajero (con `id`).
  const [ficha, setFicha] = useState<FichaCajero | null>(null);
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [conTransacciones, setConTransacciones] = useState<CajeroResumen | null>(null);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    listarCajeros(entidad || undefined)
      .then((r) => {
        if (!vigente) return;
        setCajeros(r.cajeros);
        setEntidades(r.entidades);
        setError(null);
      })
      .catch((err) => vigente && setError(err instanceof ApiError ? err.message : "No se pudo cargar la lista de cajeros."))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [entidad, recarga]);

  const nombreEntidad = (id: number) => entidades.find((e) => e.id === id)?.descripcion ?? `Entidad ${id}`;

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return cajeros.filter(
      (c) =>
        (!soloConCaja || c.caja_hoy) &&
        (!texto || c.username.toLowerCase().includes(texto) || c.nombre.toLowerCase().includes(texto)),
    );
  }, [cajeros, busqueda, soloConCaja]);

  const conCaja = cajeros.filter((c) => c.caja_hoy).length;
  const deshabilitados = cajeros.filter((c) => !c.habilitado).length;

  async function abrir(c: CajeroResumen) {
    setError(null);
    setAviso(null);
    try {
      setFicha(await obtenerCajero(c.id));
      setEditando(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo leer la ficha.");
    }
  }

  async function onGuardar(evento: FormEvent) {
    evento.preventDefault();
    if (!ficha) return;
    setGuardando(true);
    setError(null);
    try {
      if (ficha.id === undefined) {
        await crearCajero(ficha);
        setAviso(`${ficha.username.toUpperCase()} creado en el sistema de cobranzas y en el SIIC.`);
      } else {
        const { password, ...resto } = ficha;
        await actualizarCajero(ficha.username, password ? { ...resto, password } : resto);
        setAviso(`${ficha.username} actualizado.`);
      }
      setFicha(null);
      setRecarga((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarHabilitado(c: CajeroResumen) {
    setError(null);
    try {
      await actualizarCajero(c.username, { habilitado: !c.habilitado });
      setAviso(`${c.username} ${c.habilitado ? "deshabilitado: ya no puede entrar" : "habilitado"}.`);
      setRecarga((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar el estado.");
    }
  }

  const soloLectura = !esAdmin || (ficha?.id !== undefined && !editando);
  const cambiar = <K extends keyof FichaCajero>(campo: K, valor: FichaCajero[K]) =>
    setFicha((f) => (f ? { ...f, [campo]: valor } : f));

  return (
    <div className="pagina pagina--ancha">
      <div className="pagina__encabezado">
        <h1>Cajeros</h1>
        {esAdmin && (
          <button onClick={() => { setFicha(fichaNueva(entidad || 1)); setEditando(true); setAviso(null); }}>
            + Nuevo cajero
          </button>
        )}
      </div>
      <p className="detalle-fecha">
        Usuarios del sistema de cobranzas de CESSA y de los bancos.{" "}
        {esAdmin
          ? "Al crear uno se da de alta a la vez en el sistema de cobranzas y como operador en el SIIC."
          : "Solo Sistemas puede crearlos o modificarlos."}
      </p>

      <div className="tarjetas-resumen">
        <div className="tarjeta stat">
          <p className="stat__etiqueta">Usuarios</p>
          <p className="monto">{cajeros.length}</p>
        </div>
        <div className="tarjeta stat stat--ok">
          <p className="stat__etiqueta">Con caja abierta hoy</p>
          <p className="monto">{conCaja}</p>
        </div>
        <div className={`tarjeta stat ${deshabilitados ? "stat--alerta" : ""}`}>
          <p className="stat__etiqueta">Deshabilitados</p>
          <p className="monto">{deshabilitados}</p>
        </div>
      </div>

      <div className="filtros">
        <select value={entidad} onChange={(e) => setEntidad(Number(e.target.value))} aria-label="Entidad">
          <option value={0}>Todas las entidades</option>
          {entidades.map((e) => (
            <option key={e.id} value={e.id}>
              {e.descripcion}
            </option>
          ))}
        </select>
        <input type="search" placeholder="Usuario o nombre" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <label className="casilla">
          <input type="checkbox" checked={soloConCaja} onChange={(e) => setSoloConCaja(e.target.checked)} /> Solo con caja abierta
        </label>
      </div>

      {error && <p className="mensaje-error">{error}</p>}
      {aviso && (
        <p className="mensaje-ok">
          <Icono nombre="check" tamano={16} /> {aviso}
        </p>
      )}

      {ficha && (
        <form className="tarjeta tarjeta--ancha ficha-cajero" onSubmit={onGuardar}>
          <h2 className="tarjeta__titulo">
            <Icono nombre="usuario" />{" "}
            {ficha.id === undefined ? "Nuevo cajero" : `${ficha.username} · ${ficha.nombre}`}
          </h2>
          <fieldset disabled={soloLectura || guardando}>
            <div className="ficha-cajero__grilla">
              <label>
                Usuario
                <input
                  required
                  maxLength={10}
                  disabled={ficha.id !== undefined}
                  value={ficha.username}
                  onChange={(e) => cambiar("username", e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
                />
              </label>
              <label className="ficha-cajero__ancho">
                Nombre completo
                <input required maxLength={50} value={ficha.nombre} onChange={(e) => cambiar("nombre", e.target.value)} />
              </label>
              {!soloLectura && (
                <label>
                  {ficha.id === undefined ? "Contraseña" : "Nueva contraseña (opcional)"}
                  <input
                    type="password"
                    minLength={6}
                    required={ficha.id === undefined}
                    autoComplete="new-password"
                    value={ficha.password ?? ""}
                    onChange={(e) => cambiar("password", e.target.value)}
                  />
                </label>
              )}
              <label>
                Rol
                <select value={ficha.rol} onChange={(e) => cambiar("rol", e.target.value as RolNest)}>
                  {ROLES.map((r) => (
                    <option key={r.valor} value={r.valor}>
                      {r.etiqueta}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Entidad
                <select value={ficha.entidad_financiera_id} onChange={(e) => cambiar("entidad_financiera_id", Number(e.target.value))}>
                  {entidades.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.descripcion}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Horario desde
                <input type="time" required value={ficha.hora_inicial} onChange={(e) => cambiar("hora_inicial", e.target.value)} />
              </label>
              <label>
                Horario hasta
                <input type="time" required value={ficha.hora_final} onChange={(e) => cambiar("hora_final", e.target.value)} />
              </label>
              <label>
                Vigencia desde
                <input type="date" required value={ficha.habilitacion_inicio} onChange={(e) => cambiar("habilitacion_inicio", e.target.value)} />
              </label>
              <label>
                Vigencia hasta
                <input type="date" required value={ficha.habilitacion_fin} onChange={(e) => cambiar("habilitacion_fin", e.target.value)} />
              </label>
            </div>
            <div className="dias">
              <span className="detalle-fecha">Días que puede abrir caja</span>
              {DIAS.map((d) => (
                <label key={d} className={`dia${ficha.dias[d] ? " dia--activo" : ""}`}>
                  <input
                    type="checkbox"
                    checked={ficha.dias[d]}
                    onChange={(e) => cambiar("dias", { ...ficha.dias, [d]: e.target.checked })}
                  />
                  {ETIQUETA_DIA[d]}
                </label>
              ))}
            </div>
            <label className="casilla">
              <input type="checkbox" checked={ficha.habilitado} onChange={(e) => cambiar("habilitado", e.target.checked)} /> Habilitado
              (puede entrar y cobrar)
            </label>
          </fieldset>
          <div className="acciones">
            {!soloLectura && (
              <button type="submit" disabled={guardando}>
                {guardando ? "Guardando..." : ficha.id === undefined ? "Crear cajero" : "Guardar cambios"}
              </button>
            )}
            {esAdmin && soloLectura && (
              <button type="button" onClick={() => setEditando(true)}>
                Editar
              </button>
            )}
            <button type="button" className="boton-secundario" onClick={() => setFicha(null)}>
              Cerrar
            </button>
          </div>
        </form>
      )}

      {conTransacciones && <TransaccionesCajero key={conTransacciones.id} cajero={conTransacciones} onCerrar={() => setConTransacciones(null)} />}

      {cargando ? (
        <p className="detalle-fecha">Cargando...</p>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Entidad</th>
              <th>Caja hoy</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.username}</strong>
                </td>
                <td>{c.nombre}</td>
                <td>{c.rol_descripcion}</td>
                <td>{nombreEntidad(c.entidad_financiera_id)}</td>
                <td>{c.caja_hoy ? <span className="estado estado--abierta">Caja {c.caja_codigo}</span> : "—"}</td>
                <td>
                  <span className={`estado ${c.habilitado ? "estado--pagado" : "estado--error"}`}>
                    {c.habilitado ? "Habilitado" : "Deshabilitado"}
                  </span>
                </td>
                <td>
                  <div className="acciones">
                    <button className="boton-secundario boton-chico" onClick={() => abrir(c)}>
                      Ver ficha
                    </button>
                    {c.rol === "CAJA" && (
                      <button className="boton-secundario boton-chico" onClick={() => setConTransacciones(c)}>
                        Transacciones
                      </button>
                    )}
                    {esAdmin && c.username !== sesion?.username && (
                      <button className="boton-secundario boton-chico" onClick={() => cambiarHabilitado(c)}>
                        {c.habilitado ? "Deshabilitar" : "Habilitar"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={7} className="detalle-fecha">
                  {cajeros.length === 0 ? "No hay usuarios." : "Ningún usuario coincide con el filtro."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
