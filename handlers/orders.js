import { store, cambiarEstado, atenderAviso, ESTADOS } from "../lib/store.js";
import { enviarWhatsApp } from "../lib/whatsapp.js";

// Alimenta el panel de sede (celular o tableta).
// GET: pedidos y avisos. POST: { numero, estado } mueve un pedido y le avisa al cliente;
// { aviso } marca un aviso como atendido.
export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ pedidos: store.pedidos, avisos: store.avisos, estados: ESTADOS });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  const { numero, estado, aviso } = req.body ?? {};
  if (aviso) {
    return atenderAviso(String(aviso)) ? res.status(200).json({ ok: true }) : res.status(400).json({ error: "Aviso no válido" });
  }

  const cambio = cambiarEstado(String(numero), String(estado));
  if (!cambio) return res.status(400).json({ error: "Pedido o estado no válido" });

  // Por WhatsApp se le escribe al cliente; en la demo web el chat lo consulta en /api/estado.
  const { pedido, texto } = cambio;
  if (texto && pedido.canal === "WhatsApp") {
    await enviarWhatsApp(pedido.cliente, texto);
    store.conversaciones.get(pedido.cliente)?.push({ role: "assistant", content: texto });
  }
  return res.status(200).json({ ok: true, avisado: texto });
}
