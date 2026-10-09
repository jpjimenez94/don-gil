// Envío de mensajes por WhatsApp Cloud API (Meta).
const GRAPH = "https://graph.facebook.com/v21.0";

export const whatsappConfigurado = () => Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

export async function enviarWhatsApp(telefono, texto) {
  if (!whatsappConfigurado()) return false;
  const respuesta = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: telefono, type: "text", text: { body: texto } }),
  });
  if (!respuesta.ok) console.error("whatsapp envío:", respuesta.status, await respuesta.text());
  return respuesta.ok;
}
