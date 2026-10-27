import { responder } from "./agent.js";
import { store, registrarEvento, registrarConversacion, mensajeAgenteApagado, anotarChat, chatTomado } from "./store.js";
import { enviarWhatsApp } from "./whatsapp.js";

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
  // La sede tomó este chat: se guarda lo que escribió el cliente y el asistente no contesta.
  if (chatTomado(cliente)) {
    store.conversaciones.set(cliente, historial.slice(-MAX_TURNOS));
    const chat = anotarChat(cliente, "WhatsApp", historial.slice(-1));
    for (const p of store.pedidos) if (p.canal === "WhatsApp" && p.cliente === cliente && !["Entregado", "Cancelado"].includes(p.estado)) p.conversacion = [...chat.mensajes];
    return "";
  }
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

// La sede devuelve el chat a la IA. Si el cliente quedó esperando respuesta, el asistente le contesta ya,
// sabiendo lo que se habló mientras la sede atendía (como en Sauko).
export async function retomarChat(clave) {
  const chat = store.chats.get(clave);
  if (!chat || !store.agenteActivo || chat.mensajes.at(-1)?.role !== "user") return null;
  const desde = chat.mensajes.findLastIndex((m) => m.role === "assistant" && !m.manual && !m.automatico);
  const mientras = chat.mensajes
    .slice(desde + 1)
    .map((m) => `${m.role === "user" ? "Cliente" : "Sede"}: ${m.content}`)
    .join("\n");
  const nota = `[La sede atendió este chat a mano y ahora te lo devuelve. Lo que se habló mientras tanto:\n${mientras}\nResponde lo que el cliente dejó pendiente, sin repetir lo que la sede ya le dijo y sin mencionar esta nota.]`;
  const historial = chat.mensajes
    .slice(-40)
    .filter((m) => m.content)
    .map((m) => ({ role: m.role, content: m.content }));
  while (historial.length && historial[0].role !== "user") historial.shift();
  historial.push({ role: "user", content: nota });

  const cliente = chat.canal === "WhatsApp" ? clave : clave.replace(/^web:/, "");
  const { texto } = await responder(historial, { canal: chat.canal, cliente });
  const hora = new Date().toISOString();
  chat.mensajes.push({ role: "assistant", content: texto, hora });
  chat.manuales.push(texto); // el chat de la página lo recoge en su siguiente consulta
  chat.actualizado = hora;
  if (chat.canal === "WhatsApp") {
    await enviarWhatsApp(clave, texto);
    store.conversaciones.get(clave)?.push({ role: "assistant", content: texto, hora });
  }
  return texto;
}
