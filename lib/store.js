// Almacén en memoria para la demo. En producción esto va a una base de datos:
// los datos se pierden cuando la instancia de la función se reinicia.
const g = globalThis;
g.__donGil ??= { pedidos: [], avisos: [], conversaciones: new Map(), consecutivo: 100, consecutivoAvisos: 0 };

export const store = g.__donGil;

export const ESTADOS = ["Nuevo", "En preparación", "Listo", "Entregado"];

export function guardarPedido(pedido) {
  store.consecutivo += 1;
  const registro = { numero: `DG-${store.consecutivo}`, creado: new Date().toISOString(), estado: ESTADOS[0], ...pedido };
  store.pedidos.unshift(registro);
  return registro;
}

export function cambiarEstado(numero, estado) {
  const pedido = store.pedidos.find((p) => p.numero === numero);
  if (!pedido || !ESTADOS.includes(estado)) return null;
  pedido.estado = estado;
  pedido.actualizado = new Date().toISOString();
  return pedido;
}

export function guardarAviso(aviso) {
  store.consecutivoAvisos += 1;
  const registro = { id: `A-${store.consecutivoAvisos}`, creado: new Date().toISOString(), atendido: false, ...aviso };
  store.avisos.unshift(registro);
  return registro;
}

export function atenderAviso(id) {
  const aviso = store.avisos.find((a) => a.id === id);
  if (!aviso) return null;
  aviso.atendido = true;
  return aviso;
}
