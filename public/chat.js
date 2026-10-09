// Chat de demostración con apariencia de WhatsApp. Habla con el mismo agente que atiende el número real.
(() => {
  const chat = document.getElementById("chat");
  const burbuja = document.getElementById("burbuja");
  const mensajes = document.getElementById("chat-mensajes");
  const formulario = document.getElementById("chat-form");
  const entrada = document.getElementById("chat-entrada");
  const sugerencias = document.getElementById("chat-sugerencias");
  const enviarBoton = formulario.querySelector("button");
  const pesos = (n) => "$" + n.toLocaleString("es-CO");

  const historial = [];
  let ocupado = false;
  mensajes.setAttribute("data-lenis-prevent", "");

  function burbujaMensaje(texto, clase) {
    const nodo = document.createElement("div");
    nodo.className = `msg ${clase}`;
    nodo.textContent = texto;
    mensajes.append(nodo);
    mensajes.scrollTop = mensajes.scrollHeight;
    return nodo;
  }

  function tarjetaPedido(pedido) {
    const nodo = document.createElement("div");
    nodo.className = "msg msg--pedido";
    const titulo = document.createElement("strong");
    titulo.textContent = `Pedido ${pedido.numero} enviado a ${pedido.sede}`;
    const detalle = document.createElement("span");
    const productos = pedido.lineas.map((l) => `${l.cantidad} x ${l.producto}`).join(", ");
    detalle.textContent = `${productos} · ${pesos(pedido.total)} · ${pedido.pago}`;
    nodo.append(titulo, detalle);
    mensajes.append(nodo);
    mensajes.scrollTop = mensajes.scrollHeight;
  }

  function abrir(mensaje) {
    chat.classList.add("is-abierto");
    chat.setAttribute("aria-hidden", "false");
    burbuja.classList.add("is-oculta");
    if (!mensajes.childElementCount) {
      burbujaMensaje("¡Quiubo pues! Bienvenido a Don Gil. ¿Qué se le antoja hoy, mijito?", "msg--bot");
    }
    if (mensaje && !ocupado) enviar(mensaje);
    else entrada.focus({ preventScroll: true });
  }

  function cerrar() {
    chat.classList.remove("is-abierto");
    chat.setAttribute("aria-hidden", "true");
    burbuja.classList.remove("is-oculta");
  }

  async function enviar(texto) {
    texto = texto.trim();
    if (!texto || ocupado) return;
    ocupado = true;
    enviarBoton.disabled = true;
    sugerencias.hidden = true;
    burbujaMensaje(texto, "msg--yo");
    historial.push({ role: "user", content: texto });

    const escribiendo = burbujaMensaje("", "msg--bot escribiendo");
    escribiendo.innerHTML = "<i></i><i></i><i></i>";

    try {
      const respuesta = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensajes: historial }),
      });
      const datos = await respuesta.json();
      escribiendo.remove();
      if (!respuesta.ok) throw new Error(datos.error || "Error");
      historial.push({ role: "assistant", content: datos.respuesta });
      burbujaMensaje(datos.respuesta, "msg--bot");
      if (datos.pedido) tarjetaPedido(datos.pedido);
    } catch (error) {
      escribiendo.remove();
      historial.pop();
      burbujaMensaje(error.message, "msg--error");
    } finally {
      ocupado = false;
      enviarBoton.disabled = false;
      entrada.focus({ preventScroll: true });
    }
  }

  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const texto = entrada.value;
    entrada.value = "";
    enviar(texto);
  });
  sugerencias.addEventListener("click", (evento) => {
    if (evento.target.matches("button")) enviar(evento.target.textContent);
  });
  document.getElementById("chat-cerrar").addEventListener("click", cerrar);
  document.addEventListener("keydown", (evento) => evento.key === "Escape" && cerrar());
  document.querySelectorAll("[data-abrir-chat]").forEach((boton) => {
    boton.addEventListener("click", () => abrir(boton.dataset.mensaje));
  });

  window.abrirChat = abrir;
})();
