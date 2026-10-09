import { buscarPedido, buscarAviso, mensajeDeEstado } from "../lib/store.js";

const lista = (valor) => String(valor ?? "").split(",").filter(Boolean).slice(0, 10);
const manuales = (registro) => registro.conversacion.filter((m) => m.manual).map((m) => m.content);

// El chat de la demo pregunta aquí cómo van sus pedidos y si la sede le escribió:
// GET /api/estado?numeros=DG-101,DG-102&avisos=A-1
export default function handler(req, res) {
  const pedidos = lista(req.query?.numeros)
    .map(buscarPedido)
    .filter(Boolean)
    .map((p) => ({ numero: p.numero, estado: p.estado, mensaje: mensajeDeEstado(p), manuales: manuales(p) }));
  const avisos = lista(req.query?.avisos)
    .map(buscarAviso)
    .filter(Boolean)
    .map((a) => ({ id: a.id, manuales: manuales(a) }));
  return res.status(200).json({ pedidos, avisos });
}
