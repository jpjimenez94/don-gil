import { responder } from "../lib/agent.js";
import { store } from "../lib/store.js";
import { enviarWhatsApp } from "../lib/whatsapp.js";

// Webhook de WhatsApp Cloud API (Meta).
// Variables: WHATSAPP_VERIFY_TOKEN, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID.
const MAX_TURNOS = 40;

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { "hub.mode": modo, "hub.verify_token": token, "hub.challenge": reto } = req.query ?? {};
    if (modo === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) return res.status(200).send(reto);
    return res.status(403).send("Token inválido");
  }
  if (req.method !== "POST") return res.status(405).send("Método no permitido");

  const mensaje = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!mensaje) return res.status(200).send("ok"); // estados de entrega, lecturas, etc.

  const telefono = mensaje.from;
  if (mensaje.type !== "text") {
    await enviarWhatsApp(telefono, "Mijito, por acá solo le entiendo texto. Escríbame qué se le antoja y con gusto.");
    return res.status(200).send("ok");
  }

  const historial = store.conversaciones.get(telefono) ?? [];
  historial.push({ role: "user", content: mensaje.text.body.slice(0, 2000) });

  try {
    const { texto, pedido, aviso } = await responder(historial, { canal: "WhatsApp", cliente: telefono });
    historial.push({ role: "assistant", content: texto });
    const reciente = historial.slice(-MAX_TURNOS);
    store.conversaciones.set(telefono, reciente);
    // La sede ve en el panel la conversación de cada pedido de este cliente.
    for (const p of store.pedidos) if (p.canal === "WhatsApp" && p.cliente === telefono) p.conversacion = [...reciente];
    if (aviso) aviso.conversacion = [...reciente];
    await enviarWhatsApp(telefono, texto);
  } catch (error) {
    console.error("whatsapp:", error);
    historial.pop();
    await enviarWhatsApp(telefono, "Qué pena, se nos enredó algo por acá. Escríbanos de nuevo en un momentico.");
  }
  return res.status(200).send("ok");
}
