# Don Gil · página web y agente de pedidos

Demo para presentar a Don Gil Empanaditas y Buñuelitos: una página moderna (GSAP + ScrollTrigger + Lenis) y un agente de pedidos con IA que atiende por WhatsApp.

## Cómo correrlo

```bash
npm install
```

```bash
npm run dev
```

- Página: http://localhost:3000
- Panel de sede (celular o tableta): http://localhost:3000/panel.html

La clave va en un archivo `.env` (copie `.env.example`); git lo ignora. Sin `ANTHROPIC_API_KEY` la página funciona, pero el chat responde que falta la clave.

## Qué hay

| Ruta | Qué es |
| --- | --- |
| `data/menu.json` | Lista maestra: sedes, horarios, productos y las dos listas de precios (`calle` y `cc`). La leen la página y el agente. |
| `lib/agent.js` | El agente: instrucciones, voz de marca y herramientas `registrar_pedido` y `pasar_a_persona`. El total lo calcula el código, no el modelo. |
| `lib/store.js` | Pedidos y conversaciones en memoria. Solo para la demo. |
| `api/index.js` | Única función de Vercel: reparte `/api/chat`, `/api/orders`, `/api/menu` y `/api/whatsapp`. |
| `handlers/` | Chat de la demo, webhook de WhatsApp Cloud API (Meta), pedidos y menú. |
| `public/` | Página, chat estilo WhatsApp y panel de sede. |
| `server.js` | Servidor local. En Vercel no se usa: `/api` y `/public` se despliegan solos. |

## Para pasar de demo a producción

1. **Fotos reales.** El logo ya es el de Don Gil. Las fotos de `public/img` son imágenes de referencia tomadas de Rappi, no producto de Don Gil: hay que cambiarlas por las originales antes de publicar el sitio en serio.
2. **Base de datos.** `lib/store.js` guarda en memoria; en Vercel todas las rutas comparten una función, pero los pedidos se pierden cuando la instancia se reinicia. Hace falta una base de datos.
3. **Twilio.** `/api/twilio` no valida la firma `X-Twilio-Signature`; hay que agregarla antes de usarlo fuera de la demo.
4. **Número de WhatsApp.** Crear la app en Meta, apuntar el webhook a `/api/whatsapp` y llenar `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`. Falta validar la firma `X-Hub-Signature-256` de Meta antes de recibir tráfico real.
4. **Acceso al panel.** Hoy `panel.html` y `/api/orders` son públicos.
5. **Datos por confirmar con Don Gil:** horarios de San Nicolás y San Fernando, costo y cobertura del domicilio, y los precios de buñuelos y bebidas en centro comercial (la carta no los distingue por sede).
