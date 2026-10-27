// Panel de Don Gil: menú lateral como el de Sauko Store, con Operación (pedidos, conversaciones, clientes,
// resumen), Carta (disponibilidad, solicitados) y Configuración (sedes, asistente y promoción).
const INTERVALO_MS = 3000;
const MINUTOS_DEMORA = 10; // un pedido nuevo sin atender pasa a rojo
// Cada botón mueve el pedido un paso y le avisa al cliente por el chat.
const SIGUIENTE = {
  "Nuevo": () => ({ estado: "En preparación", texto: "Empezar a preparar", clase: "" }),
  "En preparación": (p) => ({ estado: "Listo", texto: p.entrega === "domicilio" ? "Despachar domicilio" : "Listo para recoger", clase: "accion--listo" }),
  "Listo": () => ({ estado: "Entregado", texto: "Marcar entregado", clase: "accion--suave" }),
};
const COLUMNAS = { "Nuevo": "col-Nuevo", "En preparación": "col-prep", "Listo": "col-Listo" };
const CONTADORES = { "Nuevo": "n-Nuevo", "En preparación": "n-prep", "Listo": "n-Listo" };
const CERRADOS = ["Entregado", "Cancelado"];
const VISTAS = {
  pedidos: "Pedidos",
  conversaciones: "Conversaciones",
  clientes: "Clientes",
  resumen: "Resumen",
  disponibilidad: "Disponibilidad",
  solicitados: "Solicitados",
  sedes: "Sedes",
  ajustes: "Asistente y promoción",
};
const CON_FILTRO_DE_SEDE = ["pedidos", "clientes", "resumen"];

const $ = (id) => document.getElementById(id);
const pesos = (n) => "$" + Math.round(n).toLocaleString("es-CO");
const hora = (iso) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
const fecha = (iso) => new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (texto) => String(texto ?? "").replace(/[&<>"]/g, (c) => ESCAPES[c]);
// Igual que en el servidor: en WhatsApp el cliente es su número; en la página, el código de la visita.
const claveDeChat = (canal, cliente) => (canal === "WhatsApp" ? String(cliente) : `web:${cliente}`);

const filtro = $("filtro");
const botonSonido = $("sonido");
const dialogo = $("conversacion");
const dialogoCancelar = $("cancelar");

let datos = { pedidos: [], avisos: [], sedes: [], chats: [], agenteActivo: true, solicitados: [], pocas: 5, analitica: null };
let menu = null;
let vista = "pedidos";
let conocidos = null; // números de pedido ya vistos; null hasta la primera carga
let audio = null;
let abierta = null; // conversación de un pedido o aviso abierta en el cuadro: { numero } o { aviso }
let porCancelar = null;
const alistados = new Map(); // pedido -> productos ya alistados (chequeo antes de despachar)
let sedeEnEdicion = null; // Sedes: id de la sede abierta; null = lista de todas
let sedeDisponibilidad = null; // Disponibilidad: id de la sede que se está viendo
let busquedaProducto = "";
let chatAbierto = null; // Conversaciones: clave del chat abierto
let filtroChat = "todas";
let busquedaChat = "";
let busquedaCliente = "";
let avisoGuardado = { texto: "", hasta: 0 };
let avisoPromo = { texto: "", hasta: 0 };

function haceCuanto(iso) {
  const minutos = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (minutos < 1) return "ahora";
  if (minutos < 60) return `hace ${minutos} min`;
  if (minutos < 1440) return `hace ${Math.floor(minutos / 60)} h ${minutos % 60} min`;
  return fecha(iso);
}

function timbre() {
  if (!audio) return;
  for (const [i, frecuencia] of [880, 1175].entries()) {
    const oscilador = audio.createOscillator();
    const volumen = audio.createGain();
    const inicio = audio.currentTime + i * 0.18;
    oscilador.frequency.value = frecuencia;
    volumen.gain.setValueAtTime(0.25, inicio);
    volumen.gain.exponentialRampToValueAtTime(0.001, inicio + 0.35);
    oscilador.connect(volumen).connect(audio.destination);
    oscilador.start(inicio);
    oscilador.stop(inicio + 0.36);
  }
}

const delaSede = (lista) => lista.filter((x) => !filtro.value || x.sede === filtro.value);
const nombreDeProducto = (id) => menu?.productos.find((p) => p.id === id)?.nombre ?? id;
const avisosAbiertos = () => datos.avisos.filter((a) => !a.atendido);

/* =========================================================
   Pedidos
   ========================================================= */

// Antes de despachar o entregar, la sede marca cada producto del pedido: evita pedidos equivocados.
const marcados = (pedido) => alistados.get(pedido.numero) ?? new Set();
const faltaAlistar = (pedido) => pedido.estado === "En preparación" && marcados(pedido).size < pedido.lineas.length;

function listaDeAlistado(pedido) {
  const hechos = marcados(pedido);
  return `
    <div class="alistar">
      <div class="alistar__cabeza"><span>Alistar: ${hechos.size} de ${pedido.lineas.length}</span><button class="enlace" type="button" data-alistar-todos="${esc(pedido.numero)}">Marcar todos</button></div>
      ${pedido.lineas
        .map((l, i) => `
          <label class="alistar__item${hechos.has(i) ? " is-hecho" : ""}">
            <input type="checkbox" data-alistar="${esc(pedido.numero)}" data-linea="${i}" ${hechos.has(i) ? "checked" : ""}>
            <span><b>${l.cantidad}×</b>${esc(l.producto)}</span><span>${pesos(l.subtotal)}</span>
          </label>`)
        .join("")}
    </div>`;
}

// El detalle de lo que se cobra, línea por línea, para que la sede y el repartidor no tengan que sumar.
function desgloseDeCobro(pedido) {
  const productos = pedido.subtotal ?? pedido.lineas.reduce((s, l) => s + l.subtotal, 0);
  const unidades = pedido.lineas.reduce((s, l) => s + l.cantidad, 0);
  const filas = [[`Productos (${unidades} ${unidades === 1 ? "unidad" : "unidades"}, precios de ${esc(pedido.sede)})`, pesos(productos), ""]];
  if (pedido.descuento) filas.push([`${pedido.descuento.tipo === "sorpresa" ? "Descuento sorpresa" : "Descuento de bienvenida"} (${pedido.descuento.pct} % sobre los productos)`, `-${pesos(pedido.descuento.valor)}`, "is-promo"]);
  if (pedido.entrega === "domicilio") filas.push([`Domicilio · ${esc(pedido.zona || "zona sin definir")}`, pesos(pedido.domicilio ?? 0), ""]);
  else filas.push(["Domicilio · recoge en la sede", "$0", "is-suave"]);
  const cobro = pedido.pagaCon
    ? `Paga con <b>${pesos(pedido.pagaCon)}</b> · ${pedido.devuelta ? `llevar devuelta de <b>${pesos(pedido.devuelta)}</b>` : "paga justo"}`
    : pedido.entrega === "domicilio" ? "No se sabe con cuánto paga: pregúntelo antes de despachar" : "Paga al recoger en la sede";
  return `
    <div class="cobro">
      ${filas.map(([concepto, valor, clase]) => `<div class="cobro__fila ${clase}"><span>${concepto}</span><span>${valor}</span></div>`).join("")}
      <div class="cobro__fila cobro__total"><span>Total a cobrar</span><span>${pesos(pedido.total)}</span></div>
      <div class="cobro__pago">${esc(pedido.pago)} en efectivo · ${cobro}</div>
    </div>`;
}

function tarjeta(pedido, esNuevo) {
  const paso = SIGUIENTE[pedido.estado](pedido);
  const demorado = pedido.estado === "Nuevo" && Date.now() - new Date(pedido.creado) > MINUTOS_DEMORA * 60000;
  const falta = faltaAlistar(pedido);
  return `
    <article class="pedido${esNuevo ? " is-nuevo" : ""}${demorado ? " is-demorado" : ""}">
      <div class="pedido__cabeza">
        <span class="pedido__numero">${esc(pedido.corto)}</span>
        <span class="pedido__tiempo">${hora(pedido.creado)} · ${haceCuanto(pedido.creado)}</span>
      </div>
      <div class="chips">
        <span class="chip${pedido.entrega === "domicilio" ? " chip--domi" : ""}">${pedido.entrega === "domicilio" ? "Domicilio" : "Recoger"}</span>
        <span class="chip">${esc(pedido.hora)}</span>
        <span class="chip">${esc(pedido.sede)}</span>
        <span class="chip">${esc(pedido.canal)}</span>
      </div>
      ${pedido.estado === "En preparación" ? listaDeAlistado(pedido) : `<ul>${pedido.lineas.map((l) => `<li><span><b>${l.cantidad}×</b>${esc(l.producto)}${l.cantidad > 1 && l.unitario ? `<small class="unitario">${pesos(l.unitario)} c/u</small>` : ""}</span><span>${pesos(l.subtotal)}</span></li>`).join("")}</ul>`}
      ${desgloseDeCobro(pedido)}
      <p class="dato"><b>Recibe:</b> ${esc(pedido.nombre)}</p>
      ${pedido.direccion ? `<p class="dato"><b>Dirección:</b> ${esc(pedido.direccion)}</p>` : ""}
      ${pedido.notas ? `<p class="dato"><b>Notas:</b> ${esc(pedido.notas)}</p>` : ""}
      <div class="pedido__enlaces">
        <button class="enlace" type="button" data-ver="${esc(pedido.numero)}">Conversación (${pedido.conversacion?.length ?? 0})</button>
        <button class="enlace enlace--peligro" type="button" data-cancelar="${esc(pedido.numero)}">Cancelar</button>
      </div>
      <button class="accion ${paso.clase}" type="button" data-numero="${esc(pedido.numero)}" data-estado="${esc(paso.estado)}" ${falta ? 'disabled title="Marque primero todo lo que va en el pedido"' : ""}>${falta ? "Aliste todo para despachar" : paso.texto}</button>
    </article>`;
}

function pintarPedidos(nuevos) {
  const pedidos = delaSede(datos.pedidos);
  const avisos = avisosAbiertos().filter((a) => !filtro.value || a.sede === filtro.value || a.sede === "Sin definir");

  for (const [estado, columna] of Object.entries(COLUMNAS)) {
    // Los más antiguos arriba: es lo primero que hay que atender.
    const lista = pedidos.filter((p) => p.estado === estado).reverse();
    $(columna).innerHTML = lista.map((p) => tarjeta(p, nuevos.has(p.numero))).join("") || `<p class="vacio">Nada por aquí.</p>`;
    $(CONTADORES[estado]).textContent = lista.length;
  }

  const pocas = datos.sedes
    .filter((s) => !filtro.value || s.nombre === filtro.value)
    .flatMap((s) => Object.entries(s.unidades ?? {}).filter(([, n]) => n > 0 && n <= (datos.pocas ?? 5)).map(([id, n]) => `${nombreDeProducto(id)} en ${s.nombre}: ${n}`));
  $("pocas").hidden = pocas.length === 0;
  $("pocas").innerHTML = pocas.length ? `<strong>Quedan pocas unidades</strong><span>${pocas.map(esc).join(" · ")}</span>` : "";

  const cerrados = pedidos.filter((p) => CERRADOS.includes(p.estado));
  $("n-cerrados").textContent = cerrados.length;
  $("col-cerrados").innerHTML =
    cerrados
      .map((p) => `
        <div class="fila${p.estado === "Cancelado" ? " fila--cancelado" : ""}">
          <button class="enlace" type="button" data-ver="${esc(p.numero)}"><strong>${esc(p.corto)}</strong></button>
          <span>${esc(p.nombre)} · ${p.lineas.map((l) => `${l.cantidad}× ${esc(l.producto)}`).join(", ")}${p.estado === "Cancelado" ? ` · Cancelado: ${esc(p.motivoCancelacion)}` : ""}</span>
          <span class="fila__hora">${hora(p.creado)}</span>
          <span>${pesos(p.total)}</span>
        </div>`)
      .join("") || `<p class="vacio">Aún no hay pedidos cerrados.</p>`;

  const activos = pedidos.filter((p) => p.estado !== "Cancelado");
  const cuenta = (estado) => pedidos.filter((p) => p.estado === estado).length;
  $("c-nuevos").textContent = cuenta("Nuevo");
  $("c-prep").textContent = cuenta("En preparación");
  $("c-listos").textContent = cuenta("Listo");
  $("c-ventas").textContent = pesos(activos.reduce((suma, p) => suma + p.total, 0));

  $("avisos-seccion").hidden = avisos.length === 0;
  $("n-avisos").textContent = avisos.length;
  $("avisos").innerHTML = avisos
    .map((a) => `
      <div class="aviso">
        <strong>${esc(a.motivo)}</strong>
        <small>${hora(a.creado)} · ${esc(a.sede)} · ${esc(a.canal)} · ${esc(a.cliente)}</small>
        <button class="enlace" type="button" data-ver-aviso="${esc(a.id)}">Ver y responder (${a.conversacion?.length ?? 0})</button>
        <button class="accion accion--suave" type="button" data-aviso="${esc(a.id)}">Marcar atendido</button>
      </div>`)
    .join("");
}

/* =========================================================
   Conversaciones: todos los chats, de WhatsApp y de la página
   ========================================================= */

function nombreDeChat(chat) {
  const pedido = datos.pedidos.find((p) => claveDeChat(p.canal, p.cliente) === chat.clave);
  if (pedido) return pedido.nombre;
  return chat.canal === "WhatsApp" ? chat.clave.replace(/^whatsapp:/, "") : "Visitante de la página";
}
// Iniciales del avatar; a un número sin nombre se le ponen sus dos últimos dígitos.
const inicial = (chat) => {
  const nombre = nombreDeChat(chat);
  return /^[+d]/.test(nombre) ? nombre.replace(/D/g, "").slice(-2) : nombre.slice(0, 1).toUpperCase();
};
const avisosDeChat = (chat) => avisosAbiertos().filter((a) => claveDeChat(a.canal, a.cliente) === chat.clave);
const pedidosDeChat = (chat) => datos.pedidos.filter((p) => claveDeChat(p.canal, p.cliente) === chat.clave);

function chatsFiltrados() {
  const texto = busquedaChat.trim().toLowerCase();
  return datos.chats.filter((chat) => {
    if (filtroChat === "atencion" && !avisosDeChat(chat).length) return false;
    if ((filtroChat === "WhatsApp" || filtroChat === "Demo web") && chat.canal !== filtroChat) return false;
    if (!texto) return true;
    return [nombreDeChat(chat), chat.clave, ...chat.mensajes.map((m) => m.content)].join(" ").toLowerCase().includes(texto);
  });
}

function pintarListaDeChats() {
  const lista = chatsFiltrados();
  $("conv-total").textContent = datos.chats.length;
  $("lista-chats").innerHTML =
    lista
      .map((chat) => {
        const ultimo = chat.mensajes.at(-1);
        const atencion = avisosDeChat(chat).length;
        return `
          <button class="wa-item${chat.clave === chatAbierto ? " is-abierto" : ""}" type="button" data-abrir-chat="${esc(chat.clave)}">
            <span class="wa-item__avatar${chat.canal === "WhatsApp" ? " is-wa" : ""}">${esc(inicial(chat))}</span>
            <span class="wa-item__texto">
              <span class="wa-item__fila"><strong>${esc(nombreDeChat(chat))}</strong><small>${chat.actualizado ? haceCuanto(chat.actualizado) : ""}</small></span>
              <span class="wa-item__fila"><span class="wa-item__ultimo">${ultimo ? `${ultimo.role === "user" ? "" : "Don Gil: "}${esc(ultimo.content.slice(0, 70))}` : ""}</span>${atencion ? '<span class="pildora is-pausada">Atender</span>' : `<span class="wa-item__canal">${chat.canal === "WhatsApp" ? "WhatsApp" : "Página"}</span>`}</span>
            </span>
          </button>`;
      })
      .join("") || `<p class="vacio">${datos.chats.length ? "Ninguna conversación coincide con la búsqueda." : "Todavía no hay conversaciones. Aparecen apenas un cliente le escribe al asistente."}</p>`;
}

function pintarChatAbierto() {
  const chat = datos.chats.find((c) => c.clave === chatAbierto);
  const panel = $("wa-chat");
  if (!chat) {
    panel.innerHTML = `<p class="vacio wa-chat__vacio">Escoja una conversación para leerla y responder.</p>`;
    panel.dataset.clave = "";
    return;
  }
  // El formulario se crea una sola vez por chat para no borrar lo que la persona está escribiendo.
  if (panel.dataset.clave !== chat.clave) {
    panel.dataset.clave = chat.clave;
    panel.innerHTML = `
      <header class="wa-chat__cabeza" id="wa-cabeza"></header>
      <div class="wa-chat__mensajes" id="wa-mensajes"></div>
      <form class="wa-chat__form" id="wa-form">
        <input id="wa-entrada" type="text" autocomplete="off" maxlength="500" placeholder="Escribirle al cliente como la sede" aria-label="Mensaje para el cliente">
        <button type="submit">Enviar</button>
      </form>`;
  }
  const pedidos = pedidosDeChat(chat);
  const avisos = avisosDeChat(chat);
  $("wa-cabeza").innerHTML = `
    <button class="enlace wa-volver" type="button" data-cerrar-chat>←</button>
    <span class="wa-item__avatar${chat.canal === "WhatsApp" ? " is-wa" : ""}">${esc(inicial(chat))}</span>
    <div>
      <strong>${esc(nombreDeChat(chat))}</strong>
      <small>${chat.canal === "WhatsApp" ? `WhatsApp · ${esc(chat.clave.replace(/^whatsapp:/, ""))}` : "Chat de la página"}${pedidos.length ? ` · Pedidos: ${pedidos.map((p) => `${esc(p.corto)} ${esc(p.estado.toLowerCase())}`).join(", ")}` : ""}</small>
    </div>
    ${avisos.map((a) => `<button class="accion accion--suave wa-atendido" type="button" data-aviso="${esc(a.id)}">Marcar atendido</button>`).join("")}`;
  const caja = $("wa-mensajes");
  const alFinal = caja.scrollHeight - caja.scrollTop - caja.clientHeight < 60;
  const etiqueta = (m) => (m.manual ? "<small>Escrito por la sede</small>" : m.automatico ? "<small>Aviso automático</small>" : "");
  const clase = (m) => (m.role === "user" ? "msg--cliente" : m.manual || m.automatico ? "msg--sede" : "msg--agente");
  caja.innerHTML = chat.mensajes.map((m) => `<div class="msg ${clase(m)}">${etiqueta(m)}${esc(m.content)}</div>`).join("");
  if (alFinal) caja.scrollTop = caja.scrollHeight;
}

function pintarConversaciones() {
  const atencion = datos.chats.filter((c) => avisosDeChat(c).length).length;
  $("t-convs").textContent = atencion;
  $("t-convs").hidden = atencion === 0;
  if (vista !== "conversaciones") return;
  pintarListaDeChats();
  pintarChatAbierto();
  $("vista-conversaciones").classList.toggle("con-chat", Boolean(chatAbierto));
}

function abrirChat(clave) {
  chatAbierto = clave;
  irA("conversaciones");
  $("wa-mensajes") && ($("wa-mensajes").scrollTop = $("wa-mensajes").scrollHeight);
}

/* =========================================================
   Clientes
   ========================================================= */

function clientes() {
  const porCliente = new Map();
  for (const p of delaSede(datos.pedidos)) {
    const clave = claveDeChat(p.canal, p.cliente);
    const c = porCliente.get(clave) ?? { clave, canal: p.canal, nombre: p.nombre, pedidos: 0, total: 0, ultimo: p.creado, sedes: new Map(), direccion: "" };
    c.pedidos += 1;
    if (p.estado !== "Cancelado") c.total += p.total;
    if (p.creado >= c.ultimo) {
      c.ultimo = p.creado;
      c.nombre = p.nombre;
      if (p.direccion) c.direccion = p.direccion;
    }
    c.sedes.set(p.sede, (c.sedes.get(p.sede) ?? 0) + 1);
    porCliente.set(clave, c);
  }
  return [...porCliente.values()]
    .map((c) => ({ ...c, sede: [...c.sedes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "", contacto: c.canal === "WhatsApp" ? c.clave.replace(/^whatsapp:/, "") : "Página" }))
    .sort((a, b) => b.total - a.total);
}

function pintarClientes() {
  if (vista !== "clientes") return;
  const todos = clientes();
  const texto = busquedaCliente.trim().toLowerCase();
  const lista = todos.filter((c) => !texto || `${c.nombre} ${c.contacto} ${c.direccion} ${c.sede}`.toLowerCase().includes(texto));
  $("cl-total").textContent = todos.length;
  $("cl-repiten").textContent = todos.filter((c) => c.pedidos > 1).length;
  $("cl-whatsapp").textContent = todos.filter((c) => c.canal === "WhatsApp").length;
  $("cl-promedio").textContent = pesos(todos.length ? todos.reduce((s, c) => s + c.total, 0) / todos.length : 0);
  $("tabla-clientes").querySelector("tbody").innerHTML =
    lista
      .map((c) => `
        <tr>
          <td><strong>${esc(c.nombre)}</strong><small>${esc(c.contacto)}${c.direccion ? ` · ${esc(c.direccion)}` : ""}</small></td>
          <td>${c.canal === "WhatsApp" ? "WhatsApp" : "Página"}</td>
          <td>${c.pedidos}</td>
          <td>${pesos(c.total)}</td>
          <td>${fecha(c.ultimo)} · ${hora(c.ultimo)}</td>
          <td>${esc(c.sede)}</td>
          <td>${datos.chats.some((ch) => ch.clave === c.clave) ? `<button class="enlace" type="button" data-abrir-chat="${esc(c.clave)}">Conversación</button>` : ""}</td>
        </tr>`)
      .join("") || `<tr><td colspan="7" class="vacio">${todos.length ? "Ningún cliente coincide con la búsqueda." : "Todavía no hay clientes: aparecen con su primer pedido."}</td></tr>`;
}

function descargarClientes() {
  const celda = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const filas = [["Nombre", "Contacto", "Canal", "Pedidos", "Total comprado", "Último pedido", "Sede habitual", "Dirección"]];
  for (const c of clientes()) filas.push([c.nombre, c.contacto, c.canal === "WhatsApp" ? "WhatsApp" : "Página", c.pedidos, c.total, new Date(c.ultimo).toLocaleString("es-CO"), c.sede, c.direccion]);
  const archivo = new Blob(["﻿" + filas.map((f) => f.map(celda).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const enlace = Object.assign(document.createElement("a"), { href: URL.createObjectURL(archivo), download: `clientes-don-gil-${new Date().toISOString().slice(0, 10)}.csv` });
  enlace.click();
  URL.revokeObjectURL(enlace.href);
}

/* =========================================================
   Resumen
   ========================================================= */

function barras(id, filas, formato = pesos) {
  const maximo = Math.max(1, ...filas.map(([, valor]) => valor));
  $(id).innerHTML =
    filas
      .map(([nombre, valor]) => `
        <div class="barra-fila">
          <span class="barra-fila__nombre">${esc(nombre)}</span>
          <span class="barra-fila__pista"><i style="width:${(valor / maximo) * 100}%"></i></span>
          <span class="barra-fila__valor">${formato(valor)}</span>
        </div>`)
      .join("") || `<p class="vacio">Sin datos todavía.</p>`;
}

function agrupar(lista, clave, valor) {
  const totales = new Map();
  for (const item of lista) totales.set(clave(item), (totales.get(clave(item)) ?? 0) + valor(item));
  return [...totales].sort((a, b) => b[1] - a[1]);
}

function columnas(id, valores, etiquetas) {
  const maximo = Math.max(1, ...valores);
  $(id).innerHTML = valores
    .map((valor, i) => `
      <div class="columna-barra" title="${esc(etiquetas[i])}: ${valor}">
        <span class="columna-barra__valor">${valor || ""}</span>
        <i style="height:${(valor / maximo) * 100}%"></i>
        <span class="columna-barra__pie">${esc(etiquetas[i])}</span>
      </div>`)
    .join("");
}

function pintarResumen() {
  if (vista !== "resumen") return;
  const pedidos = delaSede(datos.pedidos).filter((p) => p.estado !== "Cancelado");
  const ventas = pedidos.reduce((suma, p) => suma + p.total, 0);
  const entregados = pedidos.filter((p) => p.estado === "Entregado" && p.actualizado);
  const minutos = entregados.map((p) => (new Date(p.actualizado) - new Date(p.creado)) / 60000);

  $("r-ventas").textContent = pesos(ventas);
  $("r-pedidos").textContent = pedidos.length;
  $("r-ticket").textContent = pesos(pedidos.length ? ventas / pedidos.length : 0);
  $("r-tiempo").textContent = minutos.length ? `${Math.max(1, Math.round(minutos.reduce((a, b) => a + b, 0) / minutos.length))} min` : "—";

  const unidades = (n) => `${n} ${n === 1 ? "pedido" : "pedidos"}`;
  barras("r-sedes", agrupar(pedidos, (p) => p.sede, (p) => p.total));
  barras("r-productos", agrupar(pedidos.flatMap((p) => p.lineas), (l) => l.producto, (l) => l.cantidad).slice(0, 6), (n) => `${n} uds`);
  barras("r-entrega", agrupar(pedidos, (p) => (p.entrega === "domicilio" ? "Domicilio" : "Recoger"), () => 1), unidades);
  barras("r-canal", agrupar(pedidos, (p) => p.canal, () => 1), unidades);

  const a = datos.analitica;
  if (!a || !menu) return;
  // Consumo del plan: bolsa compartida entre todas las sedes.
  const { usadas, tope } = a.consumo;
  const porcentaje = tope ? Math.round((usadas / tope) * 100) : 0;
  const miles = (n) => n.toLocaleString("es-CO");
  $("consumo-cifra").textContent = `${miles(usadas)} de ${miles(tope)}`;
  $("consumo-barra").style.width = `${Math.min(100, porcentaje)}%`;
  $("consumo").classList.toggle("is-alerta", porcentaje >= 80);
  $("consumo-nota").textContent =
    porcentaje >= 100
      ? "Se superó la bolsa del mes. Las conversaciones adicionales se cobran por bloque de 1.000."
      : porcentaje >= 80
        ? `Va en el ${porcentaje} % de la bolsa del mes. Si se supera, las adicionales se cobran por bloque de 1.000.`
        : `Va en el ${porcentaje} % de la bolsa del mes, compartida entre todas las sedes. Una conversación es un cliente en un mismo día.`;

  const nombreSede = (id) => menu.sedes.find((s) => s.id === id)?.nombre ?? id;
  const nombreCategoria = (id) => menu.categorias.find((c) => c.id === id)?.nombre ?? id;
  const veces = (n) => `${n} ${n === 1 ? "vez" : "veces"}`;
  const conNombre = (filas, nombre) => filas.slice(0, 6).map(([clave, n]) => [nombre(clave), n]);
  const pedidosWeb = datos.pedidos.filter((p) => p.canal === "Demo web" && p.estado !== "Cancelado").length;
  $("a-visitas").textContent = a.visitas;
  $("a-chats").textContent = a.chats;
  $("a-mensajes").textContent = a.mensajes;
  $("a-conversion").textContent = a.visitas ? `${Math.round((pedidosWeb / a.visitas) * 100)} %` : "—";
  barras("a-sedes", conNombre(a.sedes, nombreSede), veces);
  barras("a-categorias", conNombre(a.categorias, nombreCategoria), veces);
  barras("a-vistos", conNombre(a.productosVistos, nombreDeProducto), veces);
  barras("a-pedir", conNombre(a.productosPedir, nombreDeProducto), veces);
  // De 6 a. m. a 10 p. m., que es cuando hay sedes abiertas.
  const horas = Array.from({ length: 17 }, (_, i) => i + 6);
  columnas("a-horas", horas.map((h) => a.porHora[h]), horas.map((h) => `${h % 12 || 12}${h < 12 ? "a" : "p"}`));
  columnas("a-dias", [1, 2, 3, 4, 5, 6, 0].map((d) => a.porDia[d]), ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]);
}

/* =========================================================
   Disponibilidad de la carta, por sede
   ========================================================= */

function pintarDisponibilidad() {
  const agotados = datos.sedes.reduce((n, s) => n + s.agotados.length, 0);
  $("t-agotados").textContent = agotados;
  $("t-agotados").hidden = agotados === 0;
  if (vista !== "disponibilidad" || !menu || !datos.sedes.length) return;
  sedeDisponibilidad ??= datos.sedes[0].id;
  const sede = datos.sedes.find((s) => s.id === sedeDisponibilidad) ?? datos.sedes[0];

  const productosDe = (categoria) =>
    menu.productos
      .filter((p) => p.cat === categoria.id)
      .map((p) => {
        const agotado = sede.agotados.includes(p.id);
        const unidades = sede.unidades?.[p.id];
        const pocas = unidades !== undefined && unidades > 0 && unidades <= (datos.pocas ?? 5);
        return `<div class="producto-fila${agotado ? " is-agotado" : ""}" data-nombre="${esc(p.nombre.toLowerCase())}">
          <span class="producto-fila__nombre">${esc(p.nombre)} <em>${pesos(p.precio[sede.lista])}</em>${agotado ? " <b>Agotado</b>" : pocas ? ` <b class="is-pocas">Quedan ${unidades}</b>` : ""}</span>
          <label class="producto-fila__unidades" title="Unidades disponibles hoy. Vacío: no se lleva la cuenta">
            <input type="number" min="0" step="1" inputmode="numeric" data-unidades="${esc(p.id)}" value="${unidades ?? ""}" placeholder="Sin contar" aria-label="Unidades de ${esc(p.nombre)}">
            <span>uds</span>
          </label>
          <label class="interruptor interruptor--solo"><input type="checkbox" data-producto="${esc(p.id)}" ${agotado ? "" : "checked"} aria-label="${esc(p.nombre)} disponible"></label>
        </div>`;
      })
      .join("");

  $("disponibilidad").innerHTML = `
    <div class="fichas fichas--dentro" role="group" aria-label="Sede">
      ${datos.sedes.map((s) => `<button type="button" class="ficha" data-sede-disp="${esc(s.id)}" aria-pressed="${s.id === sede.id}">${esc(s.nombre)}${s.agotados.length ? ` · ${s.agotados.length}` : ""}</button>`).join("")}
    </div>
    <section class="tarjeta" data-sede-id="${esc(sede.id)}">
      <h2>Disponibilidad en ${esc(sede.nombre)}${sede.abierta ? "" : ' <span class="pildora is-pausada">Sede en pausa</span>'}</h2>
      <p class="nota">Apague lo que se acabó, o la lista completa con el interruptor de su título. Si escribe las unidades que hay, se descuentan solas cuando un pedido entra en preparación y el producto se agota al llegar a 0. Vacío significa que no se lleva la cuenta. Los precios son los de la carta.</p>
      <input class="buscar" id="buscar-producto" type="search" placeholder="Buscar producto" value="${esc(busquedaProducto)}" aria-label="Buscar producto">
    </section>
    <div class="carta" data-sede-id="${esc(sede.id)}">
      ${menu.categorias
        .map((c) => {
          const ids = menu.productos.filter((p) => p.cat === c.id).map((p) => p.id);
          const disponibles = ids.filter((id) => !sede.agotados.includes(id)).length;
          return `<section class="tarjeta">
            <label class="interruptor interruptor--todos">
              <span><strong>${esc(c.nombre)}</strong><small>${disponibles} de ${ids.length} disponibles</small></span>
              <input type="checkbox" data-categoria="${esc(c.id)}" ${disponibles ? "checked" : ""} aria-label="Todos los productos de ${esc(c.nombre)} disponibles">
            </label>
            ${productosDe(c)}
          </section>`;
        })
        .join("")}
    </div>`;
  aplicarBusqueda();
}

function aplicarBusqueda() {
  const texto = busquedaProducto.trim().toLowerCase();
  for (const fila of document.querySelectorAll("#disponibilidad .producto-fila")) fila.hidden = Boolean(texto) && !fila.dataset.nombre.includes(texto);
  for (const seccion of document.querySelectorAll("#disponibilidad .carta > .tarjeta")) {
    seccion.hidden = Boolean(texto) && !seccion.querySelector(".producto-fila:not([hidden])");
  }
}

/* =========================================================
   Solicitados
   ========================================================= */

function pintarSolicitados() {
  const lista = [...(datos.solicitados ?? [])].sort((a, b) => b.veces - a.veces);
  $("t-solicitados").textContent = lista.length;
  $("t-solicitados").hidden = lista.length === 0;
  if (vista !== "solicitados") return;
  $("solicitados").innerHTML =
    lista
      .map((s) => `
        <div class="solicitado">
          <strong>${esc(s.producto)}</strong>
          <span class="solicitado__veces">${s.veces} ${s.veces === 1 ? "vez" : "veces"}</span>
          <span class="nota">${s.sedes.length ? esc(s.sedes.join(", ")) + " · " : ""}${esc(s.canales.join(", "))} · última ${fecha(s.ultimo)} ${hora(s.ultimo)}</span>
          <button class="enlace enlace--peligro" type="button" data-quitar-solicitado="${esc(s.clave)}">Quitar</button>
        </div>`)
      .join("") || `<p class="vacio">Todavía nadie ha pedido algo fuera de la carta.</p>`;
}

/* =========================================================
   Sedes: información, horario, domicilio y pausa
   ========================================================= */

const sedeElegida = () => datos.sedes.find((s) => s.id === sedeEnEdicion);

function pintarSedes() {
  const pausadas = datos.sedes.filter((s) => !s.abierta).length;
  $("t-sedes").textContent = pausadas;
  $("t-sedes").hidden = pausadas === 0;
  if (vista !== "sedes" || !menu || !datos.sedes.length) return;
  const sede = sedeElegida();

  if (!sede) {
    const desde = (s) => Math.min(...s.domicilio.map((z) => z.precio));
    const pedidosDe = (s) => datos.pedidos.filter((p) => p.sede === s.nombre && !CERRADOS.includes(p.estado)).length;
    $("sedes").innerHTML = `
      <p class="nota">Toque una sede para cambiar su horario, su dirección, sus tarifas de domicilio o ponerla en pausa.</p>
      <div class="sedes-lista">
        ${datos.sedes
          .map((s) => `
            <button class="sede-boton${s.abierta ? "" : " is-pausada"}" type="button" data-editar-sede="${esc(s.id)}">
              <span class="sede-boton__cabeza">
                <strong>${esc(s.nombre)}</strong>
                <span class="pildora${s.abierta ? "" : " is-pausada"}">${s.abierta ? "Abierta" : "En pausa"}</span>
              </span>
              <span>${esc(s.direccion)}</span>
              <span>${esc(s.horario)}</span>
              <span class="sede-boton__datos">
                <span>Domicilio desde ${pesos(desde(s))}</span>
                <span>${pedidosDe(s)} en curso</span>
                <span class="${s.agotados.length ? "is-alerta" : ""}">${s.agotados.length} agotado${s.agotados.length === 1 ? "" : "s"}</span>
              </span>
              <span class="sede-boton__ir">Configurar →</span>
            </button>`)
          .join("")}
      </div>`;
    return;
  }

  $("sedes").innerHTML = `
    <button class="volver" type="button" data-volver>← Todas las sedes</button>
    <section class="tarjeta sede-estado${sede.abierta ? "" : " is-pausada"}" data-sede-id="${esc(sede.id)}">
      <div>
        <h2>${esc(sede.nombre)}</h2>
        <p>${sede.abierta ? "Recibiendo pedidos. El asistente y la página la ofrecen normalmente." : "En pausa. El asistente no toma pedidos para esta sede y la página la muestra cerrada."}</p>
      </div>
      <label class="interruptor interruptor--grande">
        <span>${sede.abierta ? "Abierta" : "En pausa"}</span>
        <input type="checkbox" id="sede-abierta" ${sede.abierta ? "checked" : ""} aria-label="Recibir pedidos">
      </label>
    </section>

    <form class="tarjeta sede-form" id="sede-form" data-sede-id="${esc(sede.id)}">
      <h2>Información de la sede</h2>
      <label><span>Horario</span><input name="horario" maxlength="140" value="${esc(sede.horario)}"></label>
      <label><span>Dirección</span><input name="direccion" maxlength="160" value="${esc(sede.direccion)}"></label>
      <label><span>WhatsApp de la sede</span><input name="whatsapp" inputmode="numeric" maxlength="15" value="${esc(sede.whatsapp ?? "")}" placeholder="Sin número"></label>
      <h2>Domicilio por zona</h2>
      ${sede.domicilio
        .map((z) => `
          <label class="zona">
            <span><strong>${esc(z.nombre)}</strong><small>${esc(z.barrios.join(", "))}</small></span>
            <span class="zona__precio">$<input name="tarifa:${esc(z.id)}" type="number" min="0" max="50000" step="500" value="${z.precio}" aria-label="Tarifa ${esc(z.nombre)}"></span>
          </label>`)
        .join("")}
      <div class="sede-form__pie">
        <span class="nota" role="status">${Date.now() < avisoGuardado.hasta ? esc(avisoGuardado.texto) : ""}</span>
        <button class="accion" type="submit">Guardar cambios</button>
      </div>
    </form>
    <button class="enlace" type="button" data-sede-disp="${esc(sede.id)}" data-ir-disponibilidad>Ver la disponibilidad de productos de ${esc(sede.nombre)} →</button>`;
}

/* =========================================================
   Asistente y promoción de bienvenida
   ========================================================= */

function pintarAjustes() {
  const activo = datos.agenteActivo !== false;
  $("t-ajustes").hidden = activo;
  if (vista !== "ajustes") return;
  const promo = datos.promo;
  const campo = (nombre, etiqueta, valor, min, max, sufijo) => `
    <label><span>${etiqueta}</span><span class="promo__campo"><input name="${nombre}" type="number" min="${min}" max="${max}" value="${valor}" inputmode="numeric">${sufijo}</span></label>`;
  $("ajustes").innerHTML = `
    <section class="tarjeta sede-estado${activo ? "" : " is-pausada"}">
      <div>
        <h2>Asistente de pedidos</h2>
        <p>${activo ? "Encendido. Contesta el WhatsApp y el chat de la página, y registra los pedidos en este panel." : "Apagado. Los botones de la página abren el WhatsApp de cada sede, y a quien le escriba al asistente se le responde con esos números. No se registran pedidos nuevos en el panel."}</p>
      </div>
      <label class="interruptor interruptor--grande">
        <span>${activo ? "Encendido" : "Apagado"}</span>
        <input type="checkbox" id="agente-activo" ${activo ? "checked" : ""} aria-label="Asistente de pedidos encendido">
      </label>
    </section>
    ${promo ? `
    <form class="tarjeta promo${promo.activa ? " is-activa" : ""}" id="promo-form">
      <div class="promo__cabeza">
        <div>
          <h2>Promoción de bienvenida</h2>
          <p class="nota">${promo.activa
            ? `Activa en los pedidos por ${esc(promo.canal)}. Hoy van ${promo.hoy.primeros} de ${promo.cupo} descuentos de bienvenida y ${promo.hoy.sorpresa} de ${promo.sorpresaTope} sorpresa.`
            : `Apagada. Al prenderla, el asistente ofrece un descuento en el primer pedido de cada cliente por ${esc(promo.canal)}.`}</p>
        </div>
        <label class="interruptor interruptor--grande">
          <span>${promo.activa ? "Activa" : "Apagada"}</span>
          <input type="checkbox" name="activa" ${promo.activa ? "checked" : ""} aria-label="Promoción activa">
        </label>
      </div>
      <div class="promo__campos">
        ${campo("pct", "Descuento de bienvenida", promo.pct, 1, 50, "%")}
        ${campo("cupo", "Primeros pedidos con descuento, por día", promo.cupo, 0, 500, "pedidos")}
        ${campo("sorpresaPct", "Descuento sorpresa", promo.sorpresaPct, 0, 70, "%")}
        ${campo("sorpresaCada", "Sale la sorpresa 1 de cada", promo.sorpresaCada, 1, 100, "pedidos")}
        ${campo("sorpresaTope", "Máximo de sorpresas por día", promo.sorpresaTope, 0, 50, "")}
      </div>
      <p class="nota">Se aplica solo sobre los productos, no sobre el domicilio, y una sola vez por cliente. El sistema calcula el descuento al registrar el pedido. Si la sede cancela el pedido, el cliente recupera su descuento.</p>
      <div class="sede-form__pie">
        <span class="nota" role="status">${Date.now() < avisoPromo.hasta ? esc(avisoPromo.texto) : ""}</span>
        <button class="accion" type="submit">Guardar promoción</button>
      </div>
    </form>` : ""}`;
}

/* =========================================================
   Conversación de un pedido o un aviso (cuadro emergente)
   ========================================================= */

function registroAbierto() {
  if (!abierta) return null;
  return abierta.numero ? datos.pedidos.find((p) => p.numero === abierta.numero) : datos.avisos.find((a) => a.id === abierta.aviso);
}

function pintarConversacion() {
  const registro = registroAbierto();
  if (!registro) return;
  $("conv-titulo").textContent = abierta.numero ? `Pedido ${registro.corto}` : "Aviso para el equipo";
  $("conv-subtitulo").textContent = abierta.numero ? `${registro.nombre} · ${registro.sede} · ${registro.canal}` : `${registro.sede} · ${registro.canal} · ${registro.cliente}`;
  const etiqueta = (m) => (m.manual ? "<small>Escrito por la sede</small>" : m.automatico ? "<small>Aviso automático de la sede</small>" : "");
  const clase = (m) => (m.role === "user" ? "msg--cliente" : m.manual || m.automatico ? "msg--sede" : "msg--agente");
  const caja = $("conv-mensajes");
  const alFinal = caja.scrollHeight - caja.scrollTop - caja.clientHeight < 40;
  caja.innerHTML =
    (registro.conversacion ?? []).map((m) => `<div class="msg ${clase(m)}">${etiqueta(m)}${esc(m.content)}</div>`).join("") ||
    `<p class="vacio">No hay conversación guardada.</p>`;
  if (alFinal) caja.scrollTop = caja.scrollHeight;
}

function abrirConversacion(cual) {
  abierta = cual;
  if (!registroAbierto()) return;
  dialogo.showModal();
  pintarConversacion();
  $("conv-mensajes").scrollTop = $("conv-mensajes").scrollHeight;
}

/* =========================================================
   Navegación, datos y repintado
   ========================================================= */

function irA(nueva) {
  vista = VISTAS[nueva] ? nueva : "pedidos";
  for (const boton of document.querySelectorAll(".pestanas button[data-vista]")) boton.setAttribute("aria-selected", boton.dataset.vista === vista);
  for (const seccion of document.querySelectorAll(".vista")) seccion.hidden = seccion.id !== `vista-${vista}`;
  $("seccion-actual").textContent = VISTAS[vista];
  $("fichas").hidden = !CON_FILTRO_DE_SEDE.includes(vista);
  $("panel").classList.remove("menu-abierto");
  $("menu-boton").setAttribute("aria-expanded", "false");
  pintar();
  window.scrollTo({ top: 0 });
}

// Una sección no se repinta mientras alguien está escribiendo en ella.
const escribiendoEn = (id) => $(id)?.contains(document.activeElement) && document.activeElement.matches("input, select, textarea");

function pintar(nuevos = new Set()) {
  const pendientes = datos.pedidos.filter((p) => !CERRADOS.includes(p.estado)).length;
  const sinAtender = datos.pedidos.filter((p) => p.estado === "Nuevo").length;
  $("t-pedidos").textContent = pendientes;
  document.title = `${sinAtender ? `(${sinAtender}) ` : ""}Don Gil · Panel`;
  pintarPedidos(nuevos);
  pintarConversaciones();
  if (!escribiendoEn("vista-clientes") || document.activeElement.id === "buscar-cliente") pintarClientes();
  pintarResumen();
  if (!escribiendoEn("disponibilidad")) pintarDisponibilidad();
  pintarSolicitados();
  if (!escribiendoEn("sedes")) pintarSedes();
  if (!escribiendoEn("ajustes")) pintarAjustes();
  if (dialogo.open) pintarConversacion();
}

async function cargar() {
  try {
    const respuesta = await fetch("/api/orders");
    if (!respuesta.ok) throw new Error(respuesta.status);
    datos = await respuesta.json();
    const numeros = new Set(datos.pedidos.map((p) => p.numero));
    const nuevos = conocidos ? new Set([...numeros].filter((n) => !conocidos.has(n))) : new Set();
    conocidos = numeros;
    if (nuevos.size) timbre();
    pintar(nuevos);
    $("vivo").classList.remove("is-caido");
    $("vivo-texto").textContent = "En vivo";
  } catch {
    $("vivo").classList.add("is-caido");
    $("vivo-texto").textContent = "Sin conexión, reintentando";
  }
}

async function enviar(cuerpo, boton) {
  if (boton) boton.disabled = true;
  try {
    const respuesta = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    if (!respuesta.ok) throw new Error(respuesta.status);
  } catch {
    if (boton) {
      boton.textContent = "No se pudo guardar. Toque de nuevo";
      boton.disabled = false;
    }
    return false;
  }
  await cargar();
  return true;
}

// Fichas para ver una sede o todas en Pedidos, Clientes y Resumen.
function pintarFichas() {
  if (!menu) return;
  const ficha = (valor, texto) => `<button type="button" class="ficha" data-sede="${esc(valor)}" aria-pressed="${filtro.value === valor}">${esc(texto)}</button>`;
  $("fichas").innerHTML = ficha("", "Todas las sedes") + menu.sedes.map((s) => ficha(s.nombre, s.nombre)).join("");
}

/* =========================================================
   Eventos
   ========================================================= */

const sedeDe = (elemento) => elemento.closest("[data-sede-id]")?.dataset.sedeId;

document.querySelector("main").addEventListener("click", (evento) => {
  const boton = evento.target.closest("button");
  if (!boton) return;
  const d = boton.dataset;
  if (d.sede !== undefined && boton.closest("#fichas")) {
    filtro.value = d.sede;
    pintarFichas();
    pintar();
  } else if (d.alistarTodos) {
    const pedido = datos.pedidos.find((x) => x.numero === d.alistarTodos);
    if (pedido) alistados.set(pedido.numero, new Set(pedido.lineas.map((_, i) => i)));
    pintar();
  } else if (d.quitarSolicitado) enviar({ quitarSolicitado: d.quitarSolicitado }, boton);
  else if (d.abrirChat) abrirChat(d.abrirChat);
  else if (d.cerrarChat !== undefined) {
    chatAbierto = null;
    pintarConversaciones();
  } else if (d.filtroChat) {
    filtroChat = d.filtroChat;
    for (const f of document.querySelectorAll("[data-filtro-chat]")) f.setAttribute("aria-pressed", f === boton);
    pintarConversaciones();
  } else if (d.sedeDisp) {
    sedeDisponibilidad = d.sedeDisp;
    if (d.irDisponibilidad !== undefined) irA("disponibilidad");
    else pintarDisponibilidad();
  } else if (d.editarSede || d.volver !== undefined) {
    sedeEnEdicion = d.editarSede ?? null;
    avisoGuardado = { texto: "", hasta: 0 };
    pintarSedes();
    window.scrollTo({ top: 0 });
  } else if (d.ver) abrirConversacion({ numero: d.ver });
  else if (d.verAviso) abrirConversacion({ aviso: d.verAviso });
  else if (d.cancelar) {
    porCancelar = d.cancelar;
    $("cancelar-titulo").textContent = `Cancelar pedido ${datos.pedidos.find((p) => p.numero === porCancelar)?.corto ?? ""}`;
    dialogoCancelar.showModal();
  } else if (d.aviso) enviar({ aviso: d.aviso }, boton);
  else if (d.numero) enviar({ numero: d.numero, estado: d.estado }, boton);
  else if (boton.id === "exportar-clientes") descargarClientes();
});

document.querySelector("main").addEventListener("input", (evento) => {
  const campo = evento.target;
  if (campo.id === "buscar-producto") {
    busquedaProducto = campo.value;
    aplicarBusqueda();
  } else if (campo.id === "buscar-chat") {
    busquedaChat = campo.value;
    pintarListaDeChats();
  } else if (campo.id === "buscar-cliente") {
    busquedaCliente = campo.value;
    pintarClientes();
  }
});

document.querySelector("main").addEventListener("change", async (evento) => {
  const casilla = evento.target;
  if (casilla.matches("input[data-alistar]")) {
    const hechos = new Set(alistados.get(casilla.dataset.alistar) ?? []);
    const linea = Number(casilla.dataset.linea);
    if (casilla.checked) hechos.add(linea);
    else hechos.delete(linea);
    alistados.set(casilla.dataset.alistar, hechos);
    pintar();
    return;
  }
  if (casilla.name === "activa" && casilla.closest("#promo-form")) {
    await enviar({ promo: { activa: casilla.checked } });
    avisoPromo = { texto: casilla.checked ? "Promoción activada." : "Promoción apagada.", hasta: Date.now() + 8000 };
    casilla.blur();
    pintarAjustes();
    return;
  }
  if (casilla.id === "agente-activo") {
    await enviar({ agente: casilla.checked });
    casilla.blur();
    pintarAjustes();
    return;
  }
  const sede = sedeDe(casilla);
  if (!sede) return;
  if (casilla.id === "sede-abierta") await enviar({ sede, config: { abierta: casilla.checked } });
  else if (casilla.dataset.unidades) {
    const valor = casilla.value.trim();
    await enviar({ sede, producto: casilla.dataset.unidades, unidades: valor === "" ? null : Number(valor) });
  } else if (casilla.dataset.producto) await enviar({ sede, producto: casilla.dataset.producto, agotado: !casilla.checked });
  else if (casilla.dataset.categoria) {
    const productos = menu.productos.filter((p) => p.cat === casilla.dataset.categoria).map((p) => p.id);
    await enviar({ sede, productos, agotado: !casilla.checked });
  } else return; // los campos de los formularios se guardan con su botón
  casilla.blur();
  pintarDisponibilidad();
  pintarSedes();
});

document.querySelector("main").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const formulario = evento.target;
  if (formulario.id === "wa-form") {
    const entrada = $("wa-entrada");
    const mensaje = entrada.value.trim();
    if (!mensaje || !chatAbierto) return;
    entrada.value = "";
    if (!(await enviar({ chat: chatAbierto, mensaje }))) entrada.value = mensaje;
    $("wa-mensajes").scrollTop = $("wa-mensajes").scrollHeight;
    return;
  }
  if (formulario.id === "promo-form") {
    const campos = new FormData(formulario);
    const promo = { activa: campos.get("activa") === "on" };
    for (const nombre of ["pct", "cupo", "sorpresaPct", "sorpresaCada", "sorpresaTope"]) promo[nombre] = Number(campos.get(nombre));
    const guardado = await enviar({ promo });
    avisoPromo = { texto: guardado ? "Promoción guardada." : "No se pudo guardar. Intente de nuevo.", hasta: Date.now() + 8000 };
    document.activeElement?.blur();
    pintarAjustes();
    return;
  }
  if (formulario.id === "sede-form") {
    const campos = new FormData(formulario);
    const tarifas = {};
    for (const [nombre, valor] of campos) if (nombre.startsWith("tarifa:")) tarifas[nombre.slice(7)] = Number(valor);
    const guardado = await enviar({ sede: sedeDe(formulario), config: { horario: campos.get("horario"), direccion: campos.get("direccion"), whatsapp: campos.get("whatsapp"), tarifas } });
    document.activeElement?.blur();
    avisoGuardado = { texto: guardado ? "Guardado. El asistente ya usa estos datos." : "No se pudo guardar. Intente de nuevo.", hasta: Date.now() + 8000 };
    pintarSedes();
  }
});

$("conv-form").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const entrada = $("conv-entrada");
  const mensaje = entrada.value.trim();
  if (!mensaje || !abierta) return;
  entrada.value = "";
  const enviado = await enviar({ ...abierta, mensaje });
  if (!enviado) entrada.value = mensaje;
  $("conv-mensajes").scrollTop = $("conv-mensajes").scrollHeight;
});
$("conv-cerrar").addEventListener("click", () => dialogo.close());
dialogo.addEventListener("click", (evento) => evento.target === dialogo && dialogo.close());
dialogo.addEventListener("close", () => (abierta = null));

$("cancelar-no").addEventListener("click", () => dialogoCancelar.close());
$("cancelar-form").addEventListener("submit", () => {
  if (porCancelar) enviar({ numero: porCancelar, estado: "Cancelado", motivo: $("cancelar-motivo").value, devolver: $("cancelar-devolver").checked });
  porCancelar = null;
});

document.querySelector(".pestanas").addEventListener("click", (evento) => {
  const pestana = evento.target.closest("button[data-vista]");
  if (!pestana) return;
  if (pestana.dataset.vista === "sedes") sedeEnEdicion = null; // Sedes siempre abre en la lista de todas
  irA(pestana.dataset.vista);
});

// Menú en celular.
$("menu-boton").addEventListener("click", () => {
  const abierto = $("panel").classList.toggle("menu-abierto");
  $("menu-boton").setAttribute("aria-expanded", abierto);
});
$("menu-fondo").addEventListener("click", () => {
  $("panel").classList.remove("menu-abierto");
  $("menu-boton").setAttribute("aria-expanded", "false");
});

botonSonido.addEventListener("click", () => {
  const encender = botonSonido.getAttribute("aria-pressed") !== "true";
  if (encender) {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    timbre();
  } else {
    audio?.suspend();
    audio = null;
  }
  botonSonido.setAttribute("aria-pressed", encender);
  botonSonido.textContent = `Sonido: ${encender ? "encendido" : "apagado"}`;
});

fetch("/api/menu")
  .then((r) => r.json())
  .then((respuesta) => {
    menu = respuesta;
    for (const sede of menu.sedes) filtro.add(new Option(sede.nombre, sede.nombre));
    pintarFichas();
    pintar();
  })
  .catch(() => {});

irA("pedidos");
cargar();
setInterval(cargar, INTERVALO_MS);
