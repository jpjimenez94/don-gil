// Una sola función para todas las rutas de /api (ver vercel.json).
// Con Upstash configurado, el estado se comparte entre todas las copias del sitio (lib/persistencia.js);
// sin Upstash, vive en la memoria de cada copia.
import chat from "../handlers/chat.js";
import orders from "../handlers/orders.js";
import menu from "../handlers/menu.js";
import whatsapp from "../handlers/whatsapp.js";
import estado from "../handlers/estado.js";
import twilio from "../handlers/twilio.js";
import evento from "../handlers/evento.js";
import { hayPersistencia, cargarEstado, guardarEstado, tomarCandado, soltarCandado } from "../lib/persistencia.js";

export const rutas = { chat, orders, menu, whatsapp, estado, twilio, evento };

export default async function handler(req, res) {
  // En Vercel la reescritura cambia req.url a /api/index, así que la ruta original llega en ?ruta=.
  const deUrl = new URL(req.url, "http://localhost").pathname.replace(/^\/api\//, "").replace(/\/$/, "");
  const nombre = [req.query?.ruta ?? deUrl].flat().join("/");
  const ruta = rutas[nombre];
  if (!ruta) return res.status(404).json({ error: "No encontrado" });
  if (!hayPersistencia) return ruta(req, res);

  const cambia = req.method !== "GET";
  const candado = cambia ? await tomarCandado() : null;
  try {
    await cargarEstado();
    if (cambia) {
      // Se guarda antes de responder: en Vercel la función puede congelarse apenas sale la respuesta.
      for (const metodo of ["json", "send"]) {
        const original = res[metodo].bind(res);
        res[metodo] = async (cuerpo) => {
          await guardarEstado();
          return original(cuerpo);
        };
      }
    }
    return await ruta(req, res);
  } catch (error) {
    console.error("persistencia:", error);
    if (!res.headersSent) return res.status(500).json({ error: "No se pudo guardar. Intente de nuevo." });
  } finally {
    if (candado) await soltarCandado(candado);
  }
}
