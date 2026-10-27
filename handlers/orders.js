import { store, cambiarEstado, atenderAviso, buscarPedido, buscarAviso, agregarMensajeManual, marcarAgotado, configurarSede, resumenDeEventos, fijarUnidades, quitarSolicitud, escribirEnChat, POCAS, ESTADOS, marcarEnCaja, tomarChat, soltarChat, PAUSA_AL_ESCRIBIR_MIN, PAUSA_AL_TOMAR_MIN } from "../lib/store.js";
import { enviarWhatsApp } from "../lib/whatsapp.js";
import { retomarChat } from "../lib/conversacion.js";
import { configurarPromo, promoDeHoy, soltarPromo } from "../lib/promo.js";

// Por WhatsApp se le escribe al cliente; en la demo web el chat lo consulta en /api/estado.
async function avisarAlCliente(registro, texto) {
  if (registro.canal !== "WhatsApp") return;
  await enviarWhatsApp(registro.cliente, texto);
  store.conversaciones.get(registro.cliente)?.push({ role: "assistant", content: texto });
}

// Alimenta el panel de sede (celular o tableta).
// GET: pedidos, avisos, sedes (con su información y disponibilidad) y analítica.
// POST, una acción por llamada:
//   { numero, estado, motivo? }   mueve o cancela un pedido y le avisa al cliente
//   { numero | aviso, mensaje }   la sede le escribe al cliente
//   { aviso }                     marca un aviso como atendido
//   { sede, producto, agotado }   marca un producto como agotado o disponible en esa sede
//   { sede, productos, agotado }  lo mismo para varios a la vez (una categoría completa)
//   { sede, config }              cambia la información de la sede: abierta, horario, direccion, whatsapp, tarifas
//   { agente }                    enciende o apaga el asistente para toda la cadena
//   { sede, producto, unidades }  fija las unidades disponibles (null = no llevar la cuenta)
//   { quitarSolicitado }          borra un producto de la lista de lo que piden y no hay
//   { promo }                     configura la promoción de bienvenida (lib/promo.js)
//   { chat, mensaje }             la sede le escribe a un cliente desde Conversaciones
//   { numero, enCaja: true }      el efectivo de un pedido entregado ya llegó a la caja
//   { chat, tomar: true }         la sede toma el chat: el asistente no le contesta a ese cliente por 2 horas
//   { chat, soltar: true }        se lo devuelve a la IA, que contesta si el cliente quedó esperando
export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ pedidos: store.pedidos, avisos: store.avisos, sedes: store.sedes, agenteActivo: store.agenteActivo, solicitados: store.solicitados, pocas: POCAS, promo: promoDeHoy(), chats: [...store.chats.values()].sort((a, b) => String(b.actualizado).localeCompare(String(a.actualizado))), analitica: resumenDeEventos(), estados: ESTADOS });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  const { numero, estado, motivo, aviso, mensaje, producto, productos, agotado, sede, config } = req.body ?? {};

  if (req.body?.enCaja) {
    return marcarEnCaja(String(numero)) ? res.status(200).json({ ok: true }) : res.status(400).json({ error: "Ese pedido no está entregado" });
  }

  if (req.body?.chat !== undefined && req.body?.tomar) {
    return tomarChat(String(req.body.chat), PAUSA_AL_TOMAR_MIN) ? res.status(200).json({ ok: true }) : res.status(400).json({ error: "Conversación no válida" });
  }
  if (req.body?.chat !== undefined && req.body?.soltar) {
    if (!soltarChat(String(req.body.chat))) return res.status(400).json({ error: "Conversación no válida" });
    let retomo = false;
    try {
      retomo = Boolean(await retomarChat(String(req.body.chat)));
    } catch (error) {
      console.error("retomar chat:", error);
    }
    return res.status(200).json({ ok: true, retomo });
  }

  if (req.body?.chat !== undefined) {
    const escrito = String(mensaje ?? "").trim() ? escribirEnChat(String(req.body.chat), String(mensaje).trim()) : null;
    if (!escrito) return res.status(400).json({ error: "Conversación o mensaje no válido" });
    if (escrito.chat.canal === "WhatsApp") {
      await enviarWhatsApp(escrito.chat.clave, escrito.mensaje.content);
      store.conversaciones.get(escrito.chat.clave)?.push({ role: "assistant", content: escrito.mensaje.content });
    }
    // Mientras la sede atiende, el asistente se calla un rato en ese chat.
    tomarChat(escrito.chat.clave, PAUSA_AL_ESCRIBIR_MIN, true);
    return res.status(200).json({ ok: true });
  }

  if (req.body?.promo && typeof req.body.promo === "object") {
    return res.status(200).json({ ok: true, promo: configurarPromo(req.body.promo) });
  }

  if (req.body?.unidades !== undefined) {
    return fijarUnidades(String(sede), String(producto), req.body.unidades) ? res.status(200).json({ ok: true }) : res.status(400).json({ error: "Unidades no válidas" });
  }

  if (req.body?.quitarSolicitado !== undefined) {
    return quitarSolicitud(req.body.quitarSolicitado) ? res.status(200).json({ ok: true }) : res.status(400).json({ error: "No estaba en la lista" });
  }

  if (typeof req.body?.agente === "boolean") {
    store.agenteActivo = req.body.agente;
    return res.status(200).json({ ok: true, agenteActivo: store.agenteActivo });
  }

  if (Array.isArray(productos)) {
    const hechos = productos.slice(0, 100).map((id) => marcarAgotado(String(sede), String(id), Boolean(agotado)));
    return hechos.length && hechos.every(Boolean) ? res.status(200).json({ ok: true }) : res.status(400).json({ error: "Sede o producto no válido" });
  }

  if (producto !== undefined) {
    return marcarAgotado(String(sede), String(producto), Boolean(agotado)) ? res.status(200).json({ ok: true }) : res.status(400).json({ error: "Sede o producto no válido" });
  }

  if (config !== undefined) {
    return configurarSede(String(sede), config) ? res.status(200).json({ ok: true }) : res.status(400).json({ error: "Sede no válida" });
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

  const cambio = cambiarEstado(String(numero), String(estado), motivo, req.body?.devolver !== false);
  if (!cambio) return res.status(400).json({ error: "Pedido o estado no válido" });
  if (cambio.pedido.estado === "Cancelado") soltarPromo(cambio.pedido);
  if (cambio.texto) await avisarAlCliente(cambio.pedido, cambio.texto);
  return res.status(200).json({ ok: true, avisado: cambio.texto });
}
