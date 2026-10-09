import { buscarPedido, mensajeDeEstado } from "../lib/store.js";

// El chat de la demo pregunta aquí cómo van sus pedidos: GET /api/estado?numeros=DG-101,DG-102
export default function handler(req, res) {
  const numeros = String(req.query?.numeros ?? "").split(",").filter(Boolean).slice(0, 10);
  const pedidos = numeros
    .map(buscarPedido)
    .filter(Boolean)
    .map((p) => ({ numero: p.numero, estado: p.estado, mensaje: mensajeDeEstado(p) }));
  return res.status(200).json({ pedidos });
}
