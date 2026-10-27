// Guarda el estado de la demo (pedidos, conversaciones, sedes, analítica, promoción) en Redis de Upstash,
// para que todas las copias del sitio en Vercel vean lo mismo y nada se pierda al reiniciar.
// Sin las variables de Upstash, todo sigue en memoria como antes.
//
// Funcionamiento: cada petición que cambia algo toma un candado, carga el estado, hace su trabajo y lo
// guarda antes de responder. Las lecturas solo cargan el estado si cambió (se compara una versión).
const URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const hayPersistencia = Boolean(URL && TOKEN);

const CLAVE = "dongil:estado";
const VERSION = "dongil:version";
const CANDADO = "dongil:candado";
const CANDADO_MS = 25000;
const ESPERA_MAXIMA_MS = 20000;

async function redis(...comando) {
  const respuesta = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(comando),
  });
  const datos = await respuesta.json();
  if (datos.error) throw new Error(`Redis: ${datos.error}`);
  return datos.result;
}

// Map y Set no pasan por JSON: se guardan marcados y se reconstruyen al cargar.
const aTexto = (estado) =>
  JSON.stringify(estado, (_, valor) => {
    if (valor instanceof Map) return { __map: [...valor] };
    if (valor instanceof Set) return { __set: [...valor] };
    return valor;
  });
const deTexto = (texto) =>
  JSON.parse(texto, (_, valor) => {
    if (valor && typeof valor === "object" && "__map" in valor) return new Map(valor.__map);
    if (valor && typeof valor === "object" && "__set" in valor) return new Set(valor.__set);
    return valor;
  });

let versionCargada = null;

/** Trae el estado guardado, solo si cambió desde la última vez que esta copia lo leyó. */
export async function cargarEstado() {
  const version = await redis("GET", VERSION);
  if (version === null || version === versionCargada) return;
  const texto = await redis("GET", CLAVE);
  if (texto) Object.assign(globalThis.__donGil, deTexto(texto));
  versionCargada = version;
}

export async function guardarEstado() {
  await redis("SET", CLAVE, aTexto(globalThis.__donGil));
  versionCargada = String(await redis("INCR", VERSION));
}

/** Un solo cambio a la vez entre todas las copias del sitio. */
export async function tomarCandado() {
  const marca = `${Date.now()}-${Math.random()}`;
  const limite = Date.now() + ESPERA_MAXIMA_MS;
  while (Date.now() < limite) {
    if ((await redis("SET", CANDADO, marca, "NX", "PX", CANDADO_MS)) === "OK") return marca;
    await new Promise((listo) => setTimeout(listo, 150));
  }
  return null; // se sigue sin candado antes que dejar al cliente sin respuesta
}

export async function soltarCandado(marca) {
  if (marca && (await redis("GET", CANDADO)) === marca) await redis("DEL", CANDADO);
}
