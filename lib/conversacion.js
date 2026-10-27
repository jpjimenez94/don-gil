import { responder } from "./agent.js";
import { store, registrarEvento, registrarConversacion, mensajeAgenteApagado, anotarChat } from "./store.js";

const MAX_TURNOS = 40;
const HORAS_DE_CHARLA = 4; // tras este silencio, el cliente empieza una charla nueva (sus pedidos abiertos el agente los sigue viendo)

// Atiende un mensaje de WhatsApp (llegue por Meta o por Twilio) y devuelve la respuesta del agente.
// `cliente` identifica la conversación: el teléfono en Meta, "whatsapp:+57..." en Twilio.
export async function atenderMensaje(cliente, texto) {
  if (!store.agenteActivo) return mensajeAgenteApagado();
  registrarEvento("mensaje", "WhatsApp");
  registrarConversacion(cliente);
  const anterior = store.conversaciones.get(cliente) ?? [];
  const ultima = anterior.at(-1)?.hora;
  const vieja = !ultima || Date.now() - new Date(ultima) > HORAS_DE_CHARLA * 3600000;
  const historial = anterior.length && vieja ? [] : anterior;
  historial.push({ role: "user", content: String(texto).slice(0, 2000), hora: new Date().toISOString() });
  try {
    const { texto: respuesta, aviso } = await responder(historial, { canal: "WhatsApp", cliente });
    historial.push({ role: "assistant", content: respuesta, hora: new Date().toISOString() });
    const reciente = historial.slice(-MAX_TURNOS);
    store.conversaciones.set(cliente, reciente);
    // La sede ve en el panel la conversación de cada pedido de este cliente.
    const chat = anotarChat(cliente, "WhatsApp", historial.slice(-2));
    // Los pedidos abiertos y el aviso muestran toda la conversación con el cliente; los cerrados guardan la que tenían.
    for (const p of store.pedidos) if (p.canal === "WhatsApp" && p.cliente === cliente && !["Entregado", "Cancelado"].includes(p.estado)) p.conversacion = [...chat.mensajes];
    if (aviso) aviso.conversacion = [...chat.mensajes];
    return respuesta;
  } catch (error) {
    console.error("conversación:", error);
    historial.pop();
    return "Qué pena, se nos enredó algo por acá. Escríbanos de nuevo en un momentico.";
  }
}
