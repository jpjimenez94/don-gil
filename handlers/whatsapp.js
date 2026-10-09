import { atenderMensaje } from "../lib/conversacion.js";
import { enviarWhatsApp } from "../lib/whatsapp.js";

// Webhook de WhatsApp Cloud API (Meta).
// Variables: WHATSAPP_VERIFY_TOKEN, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID.
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
  const respuesta =
    mensaje.type === "text"
      ? await atenderMensaje(telefono, mensaje.text.body)
      : "Mijito, por acá solo le entiendo texto. Escríbame qué se le antoja y con gusto.";
  await enviarWhatsApp(telefono, respuesta);
  return res.status(200).send("ok");
}
