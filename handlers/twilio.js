import { enMensajes } from "../lib/parrafos.js";
import { atenderMensaje } from "../lib/conversacion.js";

// Webhook de WhatsApp por Twilio (entorno de pruebas o número propio).
// Twilio envía el mensaje como formulario (From, Body) y espera la respuesta en TwiML.
// Para los avisos de estado que salen del panel hacen falta TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN.
const xml = (texto) => texto.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Método no permitido");

  const cliente = req.body?.From;
  const texto = req.body?.Body;
  if (!cliente) return res.status(400).send("Falta el remitente");

  const respuesta = texto?.trim()
    ? await atenderMensaje(cliente, texto)
    : "Qué pena, por acá solo le entiendo texto. Escríbame qué se le antoja y con gusto.";

  // Una sola burbuja por respuesta: la cuenta de prueba de Twilio tiene un tope de mensajes al día
  // y cada burbuja cuenta. Con TWILIO_PARRAFOS_APARTE=1 cada párrafo sale como un mensaje aparte.
  const mensajes = process.env.TWILIO_PARRAFOS_APARTE === "1" ? enMensajes(respuesta) : [enMensajes(respuesta).join("\n\n")];
  res.setHeader("Content-Type", "text/xml; charset=utf-8");
  if (!respuesta.trim()) return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response>${mensajes.map((m) => `<Message>${xml(m)}</Message>`).join("")}</Response>`);
}
