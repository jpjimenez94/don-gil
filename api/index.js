// Una sola función para todas las rutas de /api (ver vercel.json): así el chat,
// el webhook y el panel comparten memoria mientras la instancia esté activa.
import chat from "../handlers/chat.js";
import orders from "../handlers/orders.js";
import menu from "../handlers/menu.js";
import whatsapp from "../handlers/whatsapp.js";

export const rutas = { chat, orders, menu, whatsapp };

export default function handler(req, res) {
  // En Vercel la reescritura cambia req.url a /api/index, así que la ruta original llega en ?ruta=.
  const deUrl = new URL(req.url, "http://localhost").pathname.replace(/^\/api\//, "").replace(/\/$/, "");
  const nombre = [req.query?.ruta ?? deUrl].flat().join("/");
  const ruta = rutas[nombre];
  if (!ruta) return res.status(404).json({ error: "No encontrado" });
  return ruta(req, res);
}
