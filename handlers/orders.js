import { store, cambiarEstado, atenderAviso, buscarPedido, buscarAviso, agregarMensajeManual, marcarAgotado, ESTADOS } from "../lib/store.js";
import { enviarWhatsApp } from "../lib/whatsapp.js";
import { menu } from "../lib/agent.js";

// Por WhatsApp se le escribe al cliente; en la demo web el chat lo consulta en /api/estado.
async function avisarAlCliente(registro, texto) {
  if (registro.canal !== "WhatsApp") return;
  await enviarWhatsApp(registro.cliente, texto);
  store.conversaciones.get(registro.cliente)?.push({ role: "assistant", content: texto });
}

// Alimenta el panel de sede (celular o tableta).
// GET: pedidos, avisos y productos agotados.
// POST, una acción por llamada:
//   { numero, estado, motivo? }   mueve o cancela un pedido y le avisa al cliente
//   { numero | aviso, mensaje }   la sede le escribe al cliente
//   { aviso }                     marca un aviso como atendido
//   { producto, agotado }         marca un producto como agotado o disponible
export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ pedidos: store.pedidos, avisos: store.avisos, agotados: store.agotados, estados: ESTADOS });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  const { numero, estado, motivo, aviso, mensaje, producto, agotado } = req.body ?? {};

  if (producto !== undefined) {
    if (!menu.productos.some((p) => p.id === producto)) return res.status(400).json({ error: "Producto no válido" });
    return res.status(200).json({ ok: true, agotados: marcarAgotado(producto, Boolean(agotado)) });
  }

  if (mensaje !== undefined) {
    const registro = numero ? buscarPedido(String(numero)) : buscarAviso(String(aviso));
    if (!registro || !String(mensaje).trim()) return res.status(400).json({ error: "Mensaje o destinatario no válido" });
    const { content } = agregarMensajeManual(registro, String(mensaje).trim());
    await avisarAlCliente(registro, content);
    return res.status(200).json({ ok: true });
  }

  if (aviso) {
    return atenderAviso(String(aviso)) ? res.status(200).json({ ok: true }) : res.status(400).json({ error: "Aviso no válido" });
  }

  const cambio = cambiarEstado(String(numero), String(estado), motivo);
  if (!cambio) return res.status(400).json({ error: "Pedido o estado no válido" });
  if (cambio.texto) await avisarAlCliente(cambio.pedido, cambio.texto);
  return res.status(200).json({ ok: true, avisado: cambio.texto });
}
