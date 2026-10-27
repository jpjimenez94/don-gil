// Almacén en memoria para la demo. En producción esto va a una base de datos:
// los datos se pierden cuando la instancia de la función se reinicia.
import { menu } from "./menu.js";

const g = globalThis;
g.__donGil ??= { pedidos: [], avisos: [], conversaciones: new Map(), consecutivo: 100, consecutivoAvisos: 0, agotados: [], eventos: [] };
g.__donGil.agotados ??= [];
g.__donGil.eventos ??= [];
// Interruptor general: con el asistente apagado, la página manda a los clientes al WhatsApp de cada sede.
g.__donGil.agenteActivo ??= true;
g.__donGil.conversacionesDelMes ??= { mes: "", clientes: new Set() };
// Copia viva de las sedes: lo que cada sede cambia en el panel (horario, tarifas, agotados, pausa)
// se guarda aquí y lo usan de inmediato el agente y la página.
g.__donGil.sedes ??= structuredClone(menu.sedes).map((sede) => ({ ...sede, abierta: true, agotados: [] }));
// Unidades disponibles por producto en cada sede. Sin dato = no se lleva la cuenta.
for (const sede of g.__donGil.sedes) sede.unidades ??= {};
// Productos que los clientes piden y no están en la carta.
g.__donGil.solicitados ??= [];
// Todas las conversaciones con clientes, para la sección Conversaciones del panel.
g.__donGil.chats ??= new Map();

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

// Desde este número de unidades el panel avisa que quedan pocas.
export const POCAS = 5;

// Al empezar a preparar se descuentan las unidades del pedido; al llegar a 0 el producto se agota solo.
function descontarUnidades(pedido) {
  const sede = buscarSede(pedido.sede_id);
  if (!sede || pedido.descontado) return;
  for (const linea of pedido.lineas) {
    const actual = sede.unidades[linea.producto_id];
    if (actual === undefined) continue;
    sede.unidades[linea.producto_id] = Math.max(0, actual - linea.cantidad);
    if (sede.unidades[linea.producto_id] === 0 && !sede.agotados.includes(linea.producto_id)) sede.agotados.push(linea.producto_id);
  }
  pedido.descontado = true;
}

// Al cancelar, si se pidió, las unidades vuelven a la disponibilidad.
function devolverUnidades(pedido) {
  const sede = buscarSede(pedido.sede_id);
  if (!sede || !pedido.descontado) return;
  for (const linea of pedido.lineas) {
    const actual = sede.unidades[linea.producto_id];
    if (actual === undefined) continue;
    sede.unidades[linea.producto_id] = actual + linea.cantidad;
    sede.agotados = sede.agotados.filter((id) => id !== linea.producto_id);
  }
  pedido.descontado = false;
}

export function cambiarEstado(numero, estado, motivo = "", devolver = true) {
  const pedido = buscarPedido(numero);
  if (!pedido || !ESTADOS.includes(estado)) return null;
  if (estado === "En preparación") descontarUnidades(pedido);
  if (estado === "Cancelado" && devolver) devolverUnidades(pedido);
  pedido.estado = estado;
  if (estado === "Cancelado") {
    pedido.motivoCancelacion = String(motivo).slice(0, 200);
    pedido.canceladoEn = new Date().toISOString();
    pedido.unidadesDevueltas = Boolean(devolver);
  }
  if (estado === "Entregado") pedido.entregadoEn = new Date().toISOString();
  pedido.actualizado = new Date().toISOString();
  const texto = mensajeDeEstado(pedido);
  if (texto) {
    const aviso = { role: "assistant", content: texto, automatico: true, hora: pedido.actualizado };
    pedido.conversacion.push(aviso);
    store.chats.get(claveDeChat(pedido.canal, pedido.cliente))?.mensajes.push(aviso);
  }
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

export const buscarSede = (id) => store.sedes.find((s) => s.id === id);

export function marcarAgotado(sedeId, productoId, agotado) {
  const sede = buscarSede(sedeId);
  if (!sede || !menu.productos.some((p) => p.id === productoId)) return null;
  sede.agotados = sede.agotados.filter((id) => id !== productoId);
  if (agotado) sede.agotados.push(productoId);
  // Si se vuelve a encender un producto que se agotó por llegar a 0, deja de llevarse la cuenta.
  else if (sede.unidades[productoId] === 0) delete sede.unidades[productoId];
  return sede;
}

const TARIFA_MAXIMA = 50000;

// Cambios que la sede hace desde el panel. Solo se aplican los campos que llegan y son válidos.
export function configurarSede(sedeId, cambios = {}) {
  const sede = buscarSede(sedeId);
  if (!sede) return null;
  const texto = (valor, largo) => String(valor).trim().slice(0, largo);
  if (typeof cambios.abierta === "boolean") sede.abierta = cambios.abierta;
  if (cambios.horario !== undefined && texto(cambios.horario, 140)) sede.horario = texto(cambios.horario, 140);
  if (cambios.direccion !== undefined && texto(cambios.direccion, 160)) sede.direccion = texto(cambios.direccion, 160);
  if (cambios.whatsapp !== undefined) sede.whatsapp = String(cambios.whatsapp).replace(/\D/g, "").slice(0, 15) || null;
  for (const [zonaId, valor] of Object.entries(cambios.tarifas ?? {})) {
    const zona = sede.domicilio.find((z) => z.id === zonaId);
    const precio = Math.round(Number(valor));
    if (zona && Number.isFinite(precio) && precio >= 0 && precio <= TARIFA_MAXIMA) zona.precio = precio;
  }
  return sede;
}

// ---------- Analítica ----------
// Qué miran en la página y cuándo le escriben al agente. Se guarda el evento y la hora, nada del visitante.
export const TIPOS_DE_EVENTO = ["visita", "sede", "categoria", "producto_visto", "producto_pedir", "chat_abierto", "mensaje"];
const MAX_EVENTOS = 5000;
const HORAS_BOGOTA = -5; // Colombia no tiene horario de verano

export function registrarEvento(tipo, clave = "") {
  if (!TIPOS_DE_EVENTO.includes(tipo)) return false;
  store.eventos.push({ tipo, clave: String(clave).slice(0, 60), hora: Date.now() });
  if (store.eventos.length > MAX_EVENTOS) store.eventos.splice(0, store.eventos.length - MAX_EVENTOS);
  return true;
}

// Una conversación es un cliente en un mismo día, sin importar cuántos mensajes cruce.
// La bolsa del plan es compartida entre todas las sedes.
export const CONVERSACIONES_POR_SEDE = 2000;
const hoyEnBogota = () => new Date(Date.now() + HORAS_BOGOTA * 3600000).toISOString().slice(0, 10);

export function registrarConversacion(cliente) {
  const dia = hoyEnBogota();
  const registro = store.conversacionesDelMes;
  if (registro.mes !== dia.slice(0, 7)) {
    registro.mes = dia.slice(0, 7);
    registro.clientes = new Set();
  }
  registro.clientes.add(`${dia}|${cliente}`);
}

export function consumoDelMes() {
  const mes = hoyEnBogota().slice(0, 7);
  const usadas = store.conversacionesDelMes.mes === mes ? store.conversacionesDelMes.clientes.size : 0;
  return { mes, usadas, tope: CONVERSACIONES_POR_SEDE * store.sedes.length };
}

export function resumenDeEventos() {
  const contar = (tipo) => {
    const totales = new Map();
    for (const e of store.eventos) if (e.tipo === tipo) totales.set(e.clave, (totales.get(e.clave) ?? 0) + 1);
    return [...totales].sort((a, b) => b[1] - a[1]);
  };
  const porHora = Array(24).fill(0);
  const porDia = Array(7).fill(0); // 0 = domingo
  for (const e of store.eventos) {
    if (e.tipo !== "mensaje") continue;
    const local = new Date(e.hora + HORAS_BOGOTA * 3600000);
    porHora[local.getUTCHours()] += 1;
    porDia[local.getUTCDay()] += 1;
  }
  const total = (tipo) => store.eventos.filter((e) => e.tipo === tipo).length;
  return {
    consumo: consumoDelMes(),
    visitas: total("visita"),
    chats: total("chat_abierto"),
    mensajes: total("mensaje"),
    sedes: contar("sede"),
    categorias: contar("categoria"),
    productosVistos: contar("producto_visto"),
    productosPedir: contar("producto_pedir"),
    mensajesPorCanal: contar("mensaje"),
    porHora,
    porDia,
  };
}

// ---------- Asistente apagado ----------
// Lo que se le responde a quien escribe mientras el asistente está apagado. No usa IA.
export function mensajeAgenteApagado() {
  const numeros = store.sedes.filter((s) => s.whatsapp).map((s) => `${s.nombre}: ${s.whatsapp}`);
  return `Hola. Por ahora los pedidos de Don Gil se atienden directamente en el WhatsApp de cada sede.\n\n${numeros.join("\n")}\n\nEscríbale a la que le quede más cerca y con gusto lo atienden.`;
}

// ---------- Unidades disponibles ----------
// valor: número de unidades, o null para dejar de llevar la cuenta.
export function fijarUnidades(sedeId, productoId, valor) {
  const sede = buscarSede(sedeId);
  if (!sede || !menu.productos.some((p) => p.id === productoId)) return null;
  if (valor === null || valor === "") {
    delete sede.unidades[productoId];
    return sede;
  }
  const unidades = Math.round(Number(valor));
  if (!Number.isFinite(unidades) || unidades < 0 || unidades > 100000) return null;
  sede.unidades[productoId] = unidades;
  sede.agotados = sede.agotados.filter((id) => id !== productoId);
  if (unidades === 0) sede.agotados.push(productoId);
  return sede;
}

// ---------- Lo que piden y no está en la carta ----------
export function registrarSolicitud(producto, canal, sede = "") {
  const nombre = String(producto).trim().slice(0, 60);
  if (!nombre) return null;
  const clave = nombre.toLowerCase();
  let registro = store.solicitados.find((s) => s.clave === clave);
  if (!registro) {
    registro = { clave, producto: nombre, veces: 0, canales: [], sedes: [] };
    store.solicitados.push(registro);
  }
  registro.veces += 1;
  registro.ultimo = new Date().toISOString();
  if (canal && !registro.canales.includes(canal)) registro.canales.push(canal);
  if (sede && !registro.sedes.includes(sede)) registro.sedes.push(sede);
  return registro;
}

export function quitarSolicitud(clave) {
  const antes = store.solicitados.length;
  store.solicitados = store.solicitados.filter((s) => s.clave !== String(clave).toLowerCase());
  return store.solicitados.length < antes;
}

// ---------- Conversaciones ----------
// En WhatsApp el cliente es su número; en la página, un código al azar de cada visita.
export const claveDeChat = (canal, cliente) => (canal === "WhatsApp" ? String(cliente) : `web:${cliente}`);

/** Guarda la conversación como va. Conserva los mensajes que la sede escribió a mano. */
// La conversación del panel es un registro que solo crece: se le suman los mensajes nuevos con su hora,
// aunque el agente empiece una charla de cero. Se guardan los últimos 300.
export function anotarChat(clave, canal, nuevos) {
  const actual = store.chats.get(clave) ?? { clave, canal, mensajes: [], manuales: [] };
  const ahora = new Date().toISOString();
  actual.mensajes.push(...nuevos.map(({ role, content, hora }) => ({ role, content, hora: hora ?? ahora })));
  actual.mensajes = actual.mensajes.slice(-300);
  actual.actualizado = ahora;
  store.chats.set(clave, actual);
  return actual;
}

/** La sede le escribe al cliente desde Conversaciones. */
export function escribirEnChat(clave, texto) {
  const chat = store.chats.get(clave);
  if (!chat) return null;
  const mensaje = { role: "assistant", content: String(texto).slice(0, 1000), manual: true, hora: new Date().toISOString() };
  chat.mensajes.push(mensaje);
  chat.manuales.push(mensaje.content);
  chat.actualizado = mensaje.hora;
  return { chat, mensaje };
}

// La plata de un pedido entregado: el repartidor o el cajero la reciben y la sede marca que llegó a caja.
export function marcarEnCaja(numero) {
  const pedido = buscarPedido(numero);
  if (!pedido || pedido.estado !== "Entregado") return null;
  pedido.enCaja = new Date().toISOString();
  return pedido;
}

// La sede toma un chat: mientras tanto el asistente no le contesta a ese cliente.
export const PAUSA_AL_ESCRIBIR_MIN = 30; // al escribirle desde el panel, el asistente se calla este rato
export const PAUSA_AL_TOMAR_MIN = 120; // con el botón "Tomar el chat"

export function chatTomado(clave) {
  const chat = store.chats.get(clave);
  return Boolean(chat?.tomadoHasta && new Date(chat.tomadoHasta) > Date.now());
}

/** soloAlargar: si ya estaba tomado por más tiempo, se deja así (al escribir no se acorta la pausa). */
export function tomarChat(clave, minutos, soloAlargar = false) {
  const chat = store.chats.get(clave);
  if (!chat) return null;
  const hasta = new Date(Date.now() + minutos * 60000).toISOString();
  if (!soloAlargar || !chatTomado(clave) || chat.tomadoHasta < hasta) chat.tomadoHasta = hasta;
  return chat;
}

export function soltarChat(clave) {
  const chat = store.chats.get(clave);
  if (!chat) return null;
  chat.tomadoHasta = null;
  return chat;
}
