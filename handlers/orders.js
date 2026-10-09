import { store, cambiarEstado, atenderAviso, ESTADOS } from "../lib/store.js";

// Alimenta el panel de sede (celular o tableta).
// GET: pedidos y avisos. POST: { numero, estado } mueve un pedido; { aviso } marca un aviso como atendido.
export default function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ pedidos: store.pedidos, avisos: store.avisos, estados: ESTADOS });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  const { numero, estado, aviso } = req.body ?? {};
  const resultado = aviso ? atenderAviso(String(aviso)) : cambiarEstado(String(numero), String(estado));
  if (!resultado) return res.status(400).json({ error: "Pedido, estado o aviso no válido" });
  return res.status(200).json({ ok: true, resultado });
}
