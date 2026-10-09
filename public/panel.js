// Panel de sede: tablero de pedidos, resumen de ventas y disponibilidad de la carta.
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

const $ = (id) => document.getElementById(id);
const pesos = (n) => "$" + Math.round(n).toLocaleString("es-CO");
const hora = (iso) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (texto) => String(texto ?? "").replace(/[&<>"]/g, (c) => ESCAPES[c]);

const filtro = $("filtro");
const botonSonido = $("sonido");
const dialogo = $("conversacion");
const dialogoCancelar = $("cancelar");
let datos = { pedidos: [], avisos: [], sedes: [], analitica: null };
let menu = null;
let conocidos = null; // números de pedido ya vistos; null hasta la primera carga
let audio = null;
let abierta = null; // conversación abierta: { numero } o { aviso }
let porCancelar = null;
let avisoGuardado = { texto: "", hasta: 0 }; // confirmación de "Mi sede", visible unos segundos

function recordar(clave, valor) {
  try {
    if (valor === undefined) return localStorage.getItem(clave);
    localStorage.setItem(clave, valor);
  } catch {
    return null;
  }
}

function haceCuanto(iso) {
  const minutos = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (minutos < 1) return "ahora";
  if (minutos < 60) return `hace ${minutos} min`;
  return `hace ${Math.floor(minutos / 60)} h ${minutos % 60} min`;
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

/* ---------- Pedidos ---------- */

function tarjeta(pedido, esNuevo) {
  const paso = SIGUIENTE[pedido.estado](pedido);
  const demorado = pedido.estado === "Nuevo" && Date.now() - new Date(pedido.creado) > MINUTOS_DEMORA * 60000;
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
      <ul>${pedido.lineas.map((l) => `<li><span><b>${l.cantidad}×</b>${esc(l.producto)}</span><span>${pesos(l.subtotal)}</span></li>`).join("")}</ul>
      ${pedido.domicilio ? `<p class="dato dato--domi"><span><b>Domicilio:</b> ${esc(pedido.zona)}</span><span>${pesos(pedido.domicilio)}</span></p>` : ""}
      <div class="total"><span>${esc(pedido.pago)}</span><span>${pesos(pedido.total)}</span></div>
      <p class="dato"><b>Recibe:</b> ${esc(pedido.nombre)}</p>
      ${pedido.direccion ? `<p class="dato"><b>Dirección:</b> ${esc(pedido.direccion)}</p>` : ""}
      ${pedido.notas ? `<p class="dato"><b>Notas:</b> ${esc(pedido.notas)}</p>` : ""}
      <div class="pedido__enlaces">
        <button class="enlace" type="button" data-ver="${esc(pedido.numero)}">Conversación (${pedido.conversacion?.length ?? 0})</button>
        <button class="enlace enlace--peligro" type="button" data-cancelar="${esc(pedido.numero)}">Cancelar</button>
      </div>
      <button class="accion ${paso.clase}" type="button" data-numero="${esc(pedido.numero)}" data-estado="${esc(paso.estado)}">${paso.texto}</button>
    </article>`;
}

function pintarPedidos(nuevos) {
  const pedidos = delaSede(datos.pedidos);
  const avisos = datos.avisos.filter((a) => !a.atendido && (!filtro.value || a.sede === filtro.value || a.sede === "Sin definir"));

  for (const [estado, columna] of Object.entries(COLUMNAS)) {
    // Los más antiguos arriba: es lo primero que hay que atender.
    const lista = pedidos.filter((p) => p.estado === estado).reverse();
    $(columna).innerHTML = lista.map((p) => tarjeta(p, nuevos.has(p.numero))).join("") || `<p class="vacio">Nada por aquí.</p>`;
    $(CONTADORES[estado]).textContent = lista.length;
  }

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
  $("t-pedidos").textContent = cuenta("Nuevo") + cuenta("En preparación") + cuenta("Listo");

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

  document.title = `${cuenta("Nuevo") ? `(${cuenta("Nuevo")}) ` : ""}Don Gil · Panel de sede`;
}

/* ---------- Resumen ---------- */

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

function pintarResumen() {
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
  pintarInteres();
}

/* ---------- Interés en la página y horarios ---------- */

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

function pintarInteres() {
  const a = datos.analitica;
  if (!a || !menu) return;
  const nombreSede = (id) => menu.sedes.find((s) => s.id === id)?.nombre ?? id;
  const nombreProducto = (id) => menu.productos.find((p) => p.id === id)?.nombre ?? id;
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
  barras("a-vistos", conNombre(a.productosVistos, nombreProducto), veces);
  barras("a-pedir", conNombre(a.productosPedir, nombreProducto), veces);

  // De 6 a. m. a 10 p. m., que es cuando hay sedes abiertas.
  const horas = Array.from({ length: 17 }, (_, i) => i + 6);
  columnas("a-horas", horas.map((h) => a.porHora[h]), horas.map((h) => `${h % 12 || 12}${h < 12 ? "a" : "p"}`));
  const dias = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  columnas("a-dias", [1, 2, 3, 4, 5, 6, 0].map((d) => a.porDia[d]), dias);
}

/* ---------- Mi sede: información y disponibilidad ---------- */

const sedeElegida = () => datos.sedes.find((s) => s.nombre === filtro.value);

function pintarCarta() {
  if (!menu || !datos.sedes.length) return;
  const sede = sedeElegida();
  const pausadas = datos.sedes.filter((s) => !s.abierta).length;
  const novedades = sede ? sede.agotados.length + (sede.abierta ? 0 : 1) : datos.sedes.reduce((n, s) => n + s.agotados.length, 0) + pausadas;
  $("t-agotados").textContent = novedades;
  $("t-agotados").hidden = novedades === 0;

  if (!sede) {
    $("carta").innerHTML = `
      <p class="nota">Cada sede maneja su horario, sus tarifas de domicilio y lo que tiene disponible. Escoja una para verla y configurarla.</p>
      <div class="sedes-lista">
        ${datos.sedes
          .map((s) => `
            <button class="sede-boton" type="button" data-elegir-sede="${esc(s.nombre)}">
              <strong>${esc(s.nombre)}</strong>
              <span>${esc(s.horario)}</span>
              <span class="sede-boton__estado${s.abierta ? "" : " is-pausada"}">${s.abierta ? "Recibiendo pedidos" : "En pausa"}${s.agotados.length ? ` · ${s.agotados.length} agotado${s.agotados.length === 1 ? "" : "s"}` : ""}</span>
            </button>`)
          .join("")}
      </div>`;
    return;
  }

  const productosDe = (categoria) =>
    menu.productos
      .filter((p) => p.cat === categoria.id)
      .map((p) => {
        const agotado = sede.agotados.includes(p.id);
        return `<label class="interruptor${agotado ? " is-agotado" : ""}">
          <span>${esc(p.nombre)} <em>${pesos(p.precio[sede.lista])}</em>${agotado ? " <b>Agotado</b>" : ""}</span>
          <input type="checkbox" data-producto="${esc(p.id)}" ${agotado ? "" : "checked"} aria-label="${esc(p.nombre)} disponible">
        </label>`;
      })
      .join("");

  $("carta").innerHTML = `
    <section class="tarjeta sede-estado${sede.abierta ? "" : " is-pausada"}">
      <div>
        <h2>${esc(sede.nombre)}</h2>
        <p>${sede.abierta ? "Recibiendo pedidos. El asistente y la página la ofrecen normalmente." : "En pausa. El asistente no toma pedidos para esta sede y la página la muestra cerrada."}</p>
      </div>
      <label class="interruptor interruptor--grande">
        <span>${sede.abierta ? "Abierta" : "En pausa"}</span>
        <input type="checkbox" id="sede-abierta" ${sede.abierta ? "checked" : ""} aria-label="Recibir pedidos">
      </label>
    </section>

    <form class="tarjeta sede-form" id="sede-form">
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
        <span class="nota" id="sede-guardado" role="status">${Date.now() < avisoGuardado.hasta ? esc(avisoGuardado.texto) : ""}</span>
        <button class="accion" type="submit">Guardar cambios</button>
      </div>
    </form>

    <p class="nota">Apague lo que se acabó en ${esc(sede.nombre)}. El asistente deja de ofrecerlo en esta sede en el siguiente mensaje. Los precios de los productos son los de la carta y no se cambian aquí.</p>
    <div class="carta">
      ${menu.categorias.map((c) => `<section class="tarjeta"><h2>${esc(c.nombre)}</h2>${productosDe(c)}</section>`).join("")}
    </div>`;
}

/* ---------- Conversación ---------- */

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

/* ---------- Datos ---------- */

function pintar(nuevos = new Set()) {
  pintarPedidos(nuevos);
  pintarResumen();
  // "Mi sede" no se repinta mientras alguien está escribiendo en ella.
  if (!$("carta").contains(document.activeElement)) pintarCarta();
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

/* ---------- Eventos ---------- */

document.querySelector("main").addEventListener("click", (evento) => {
  const boton = evento.target.closest("button");
  if (!boton) return;
  const d = boton.dataset;
  if (d.ver) abrirConversacion({ numero: d.ver });
  else if (d.verAviso) abrirConversacion({ aviso: d.verAviso });
  else if (d.cancelar) {
    porCancelar = d.cancelar;
    $("cancelar-titulo").textContent = `Cancelar pedido ${datos.pedidos.find((p) => p.numero === porCancelar)?.corto ?? ""}`;
    dialogoCancelar.showModal();
  } else if (d.aviso) enviar({ aviso: d.aviso }, boton);
  else if (d.numero) enviar({ numero: d.numero, estado: d.estado }, boton);
});

$("carta").addEventListener("click", (evento) => {
  const boton = evento.target.closest("button[data-elegir-sede]");
  if (!boton) return;
  filtro.value = boton.dataset.elegirSede;
  filtro.dispatchEvent(new Event("change"));
});

$("carta").addEventListener("change", async (evento) => {
  const sede = sedeElegida();
  if (!sede) return;
  const casilla = evento.target;
  if (casilla.id === "sede-abierta") await enviar({ sede: sede.id, config: { abierta: casilla.checked } });
  else if (casilla.dataset.producto) await enviar({ sede: sede.id, producto: casilla.dataset.producto, agotado: !casilla.checked });
  else return; // los campos del formulario se guardan con el botón
  pintarCarta();
});

$("carta").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const sede = sedeElegida();
  if (!sede) return;
  const campos = new FormData(evento.target);
  const tarifas = {};
  for (const [nombre, valor] of campos) if (nombre.startsWith("tarifa:")) tarifas[nombre.slice(7)] = Number(valor);
  const guardado = await enviar({ sede: sede.id, config: { horario: campos.get("horario"), direccion: campos.get("direccion"), whatsapp: campos.get("whatsapp"), tarifas } });
  document.activeElement?.blur();
  avisoGuardado = { texto: guardado ? "Guardado. El asistente ya usa estos datos." : "No se pudo guardar. Intente de nuevo.", hasta: Date.now() + 8000 };
  pintarCarta();
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
  if (porCancelar) enviar({ numero: porCancelar, estado: "Cancelado", motivo: $("cancelar-motivo").value });
  porCancelar = null;
});

document.querySelector(".pestanas").addEventListener("click", (evento) => {
  const pestana = evento.target.closest("button[data-vista]");
  if (!pestana) return;
  for (const otra of document.querySelectorAll(".pestanas button")) otra.setAttribute("aria-selected", otra === pestana);
  for (const vista of document.querySelectorAll(".vista")) vista.hidden = vista.id !== `vista-${pestana.dataset.vista}`;
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

filtro.addEventListener("change", () => {
  recordar("don-gil-sede", filtro.value);
  pintar();
});

fetch("/api/menu")
  .then((r) => r.json())
  .then((respuesta) => {
    menu = respuesta;
    for (const sede of menu.sedes) filtro.add(new Option(sede.nombre, sede.nombre));
    filtro.value = recordar("don-gil-sede") ?? "";
    pintar();
  })
  .catch(() => {});

cargar();
setInterval(cargar, INTERVALO_MS);
