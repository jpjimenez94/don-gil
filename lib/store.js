// Almacén en memoria para la demo. En producción esto va a una base de datos:
// los datos se pierden cuando la instancia de la función se reinicia.
const g = globalThis;
g.__donGil ??= { pedidos: [], avisos: [], conversaciones: new Map(), consecutivo: 100, consecutivoAvisos: 0, agotados: [] };
g.__donGil.agotados ??= [];

export const store = g.__donGil;

export const ESTADOS = ["Nuevo", "En preparación", "Listo", "Entregado", "Cancelado"];

const pesos = (n) => "$" + n.toLocaleString("es-CO");

// Lo que se le dice al cliente cuando la sede mueve el pedido en el panel.
export function mensajeDeEstado(pedido) {
  const domicilio = pedido.entrega === "domicilio";
  switch (pedido.estado) {
    case "En preparación":
      return `${pedido.nombre}, su pedido ${pedido.corto} ya está en preparación en ${pedido.sede}. Ya casi, pues.`;
    case "Listo":
      return domicilio
        ? `Su pedido ${pedido.corto} ya salió para ${pedido.direccion}. Tenga a la mano ${pesos(pedido.total)} para pagar contra entrega.`
        : `Su pedido ${pedido.corto} ya está listo. Lo esperamos en ${pedido.sede}; son ${pesos(pedido.total)}.`;
    case "Entregado":
      return `Pedido ${pedido.corto} entregado. ¡Gracias por pedir en Don Gil, que lo disfrute pues!`;
    case "Cancelado":
      return `Qué pena, ${pedido.nombre}: tuvimos que cancelar su pedido ${pedido.corto}${pedido.motivoCancelacion ? ` (${pedido.motivoCancelacion})` : ""}. Escríbanos por aquí y lo resolvemos.`;
    default:
      return null;
  }
}

export function guardarPedido(pedido) {
  store.consecutivo += 1;
  const registro = {
    numero: `DG-${store.consecutivo}`, // identificador interno
    corto: `#${store.consecutivo}`, // como se le dice al cliente: "pedido #101"
    creado: new Date().toISOString(),
    estado: ESTADOS[0],
    conversacion: [],
    ...pedido,
  };
  store.pedidos.unshift(registro);
  return registro;
}

export const buscarPedido = (numero) => store.pedidos.find((p) => p.numero === numero);

export function cambiarEstado(numero, estado, motivo = "") {
  const pedido = buscarPedido(numero);
  if (!pedido || !ESTADOS.includes(estado)) return null;
  pedido.estado = estado;
  if (estado === "Cancelado") pedido.motivoCancelacion = String(motivo).slice(0, 200);
  pedido.actualizado = new Date().toISOString();
  const texto = mensajeDeEstado(pedido);
  if (texto) pedido.conversacion.push({ role: "assistant", content: texto, automatico: true, hora: pedido.actualizado });
  return { pedido, texto };
}

export function guardarAviso(aviso) {
  store.consecutivoAvisos += 1;
  const registro = { id: `A-${store.consecutivoAvisos}`, creado: new Date().toISOString(), atendido: false, conversacion: [], ...aviso };
  store.avisos.unshift(registro);
  return registro;
}

export function atenderAviso(id) {
  const aviso = store.avisos.find((a) => a.id === id);
  if (!aviso) return null;
  aviso.atendido = true;
  return { aviso };
}

// Mensaje escrito a mano por la sede desde el panel, sobre un pedido o un aviso.
export function agregarMensajeManual(registro, texto) {
  const mensaje = { role: "assistant", content: String(texto).slice(0, 1000), manual: true, hora: new Date().toISOString() };
  registro.conversacion.push(mensaje);
  return mensaje;
}

export const buscarAviso = (id) => store.avisos.find((a) => a.id === id);

export function marcarAgotado(productoId, agotado) {
  store.agotados = store.agotados.filter((id) => id !== productoId);
  if (agotado) store.agotados.push(productoId);
  return store.agotados;
}
