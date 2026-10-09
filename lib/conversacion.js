import { responder } from "./agent.js";
import { store, registrarEvento } from "./store.js";

const MAX_TURNOS = 40;

// Atiende un mensaje de WhatsApp (llegue por Meta o por Twilio) y devuelve la respuesta del agente.
// `cliente` identifica la conversación: el teléfono en Meta, "whatsapp:+57..." en Twilio.
export async function atenderMensaje(cliente, texto) {
  registrarEvento("mensaje", "WhatsApp");
  const historial = store.conversaciones.get(cliente) ?? [];
  historial.push({ role: "user", content: String(texto).slice(0, 2000) });
  try {
    const { texto: respuesta, aviso } = await responder(historial, { canal: "WhatsApp", cliente });
    historial.push({ role: "assistant", content: respuesta });
    const reciente = historial.slice(-MAX_TURNOS);
    store.conversaciones.set(cliente, reciente);
    // La sede ve en el panel la conversación de cada pedido de este cliente.
    for (const p of store.pedidos) if (p.canal === "WhatsApp" && p.cliente === cliente) p.conversacion = [...reciente];
    if (aviso) aviso.conversacion = [...reciente];
    return respuesta;
  } catch (error) {
    console.error("conversación:", error);
    historial.pop();
    return "Qué pena, se nos enredó algo por acá. Escríbanos de nuevo en un momentico.";
  }
}
