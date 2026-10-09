import { store, cambiarEstado, atenderAviso, buscarPedido, buscarAviso, agregarMensajeManual, marcarAgotado, configurarSede, resumenDeEventos, ESTADOS } from "../lib/store.js";
import { enviarWhatsApp } from "../lib/whatsapp.js";

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
export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ pedidos: store.pedidos, avisos: store.avisos, sedes: store.sedes, agenteActivo: store.agenteActivo, analitica: resumenDeEventos(), estados: ESTADOS });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  const { numero, estado, motivo, aviso, mensaje, producto, productos, agotado, sede, config } = req.body ?? {};

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

  const cambio = cambiarEstado(String(numero), String(estado), motivo);
  if (!cambio) return res.status(400).json({ error: "Pedido o estado no válido" });
  if (cambio.texto) await avisarAlCliente(cambio.pedido, cambio.texto);
  return res.status(200).json({ ok: true, avisado: cambio.texto });
}
