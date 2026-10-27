// Parte la respuesta del agente en mensajes, como escribe una persona: cada párrafo aparte,
// pero el resumen y la confirmación del pedido (líneas con •, 📍, 👤, 💵, 🏠, total…) van en un solo bloque.
const CONTINUA = /^(•|📍|👤|💵|🏠|\*?Total|Le llevamos|Lo reclama|[1-9]\uFE0F?\u20E3|¿Cuál|¿Le sumo|Me puede responder)/u;

export function enMensajes(texto) {
  const partes = String(texto).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const mensajes = [];
  for (const parte of partes) {
    if (mensajes.length && CONTINUA.test(parte)) mensajes[mensajes.length - 1] += `\n${parte}`;
    else mensajes.push(parte);
  }
  return mensajes;
}
