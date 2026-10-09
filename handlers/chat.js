import { responder } from "../lib/agent.js";
import { buscarPedido, registrarEvento } from "../lib/store.js";

const CANAL = "Demo web";

// Chat de demostración de la página: mismo agente que atiende WhatsApp.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  const historial = Array.isArray(req.body?.mensajes) ? req.body.mensajes : [];
  const valido =
    historial.length > 0 &&
    historial.length <= 60 &&
    historial.every((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.length <= 2000) &&
    historial.at(-1).role === "user";
  if (!valido) return res.status(400).json({ error: "Conversación no válida" });

  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return res.status(503).json({ error: "Falta configurar ANTHROPIC_API_KEY en el servidor." });
  }

  registrarEvento("mensaje", CANAL);

  try {
    const { texto, pedido, aviso } = await responder(historial, { canal: CANAL, cliente: req.body?.cliente || "Visitante" });

    // La conversación queda guardada con el pedido para que la sede la vea en el panel.
    const conversacion = [...historial.map(({ role, content }) => ({ role, content })), { role: "assistant", content: texto }];
    const numeros = Array.isArray(req.body?.pedidos) ? req.body.pedidos.slice(0, 10).map(String) : [];
    for (const anterior of numeros.map(buscarPedido)) {
      if (anterior?.canal === CANAL) anterior.conversacion = conversacion;
    }
    if (pedido) pedido.conversacion = conversacion;
    if (aviso) aviso.conversacion = conversacion;

    return res.status(200).json({ respuesta: texto, pedido, aviso });
  } catch (error) {
    console.error("chat:", error);
    return res.status(502).json({ error: "El agente no pudo responder. Intente de nuevo." });
  }
}
