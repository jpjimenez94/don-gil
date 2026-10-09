// Envío de mensajes por WhatsApp. Los clientes que llegan por Twilio se identifican
// como "whatsapp:+57..."; los de WhatsApp Cloud API (Meta), con el teléfono solo.
const GRAPH = "https://graph.facebook.com/v21.0";
const TWILIO_SANDBOX = "whatsapp:+14155238886";

async function enviarPorTwilio(destino, texto) {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token } = process.env;
  if (!sid || !token) return false;
  const respuesta = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` },
    body: new URLSearchParams({ From: process.env.TWILIO_WHATSAPP_FROM || TWILIO_SANDBOX, To: destino, Body: texto }),
  });
  if (!respuesta.ok) console.error("twilio envío:", respuesta.status, await respuesta.text());
  return respuesta.ok;
}

async function enviarPorMeta(telefono, texto) {
  const { WHATSAPP_TOKEN: token, WHATSAPP_PHONE_NUMBER_ID: id } = process.env;
  if (!token || !id) return false;
  const respuesta = await fetch(`${GRAPH}/${id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: telefono, type: "text", text: { body: texto } }),
  });
  if (!respuesta.ok) console.error("whatsapp envío:", respuesta.status, await respuesta.text());
  return respuesta.ok;
}

export function enviarWhatsApp(destino, texto) {
  return String(destino).startsWith("whatsapp:") ? enviarPorTwilio(destino, texto) : enviarPorMeta(destino, texto);
}
