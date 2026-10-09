import { registrarEvento } from "../lib/store.js";

// La página avisa aquí qué se mira: POST { tipo, clave }. Ver TIPOS_DE_EVENTO en lib/store.js.
// "mensaje" lo registra el servidor, no la página.
export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  const { tipo, clave } = req.body ?? {};
  if (tipo === "mensaje" || !registrarEvento(String(tipo), clave ?? "")) return res.status(400).json({ error: "Evento no válido" });
  return res.status(204).send("");
}
