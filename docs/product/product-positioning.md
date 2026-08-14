# Posicionamiento de Kamikaze AI

**Vigencia:** 14 de agosto de 2026.

## Tesis

> Kamikaze AI es un operador auditable de ventas y soporte por WhatsApp para empresas hispanohablantes. Responde desde información empresarial verificada, ejecuta flujos acotados, conserva trazabilidad operativa y devuelve el control a una persona cuando la información o la autorización no alcanzan.

No se posiciona como “chatbot genérico”. Meta anunció **Meta Business Agent** en junio de 2026 con respuestas sobre el negocio, recomendaciones, calificación de leads, turnos, ventas y toma humana. La diferenciación debe estar en el onboarding local, integraciones con sistemas autoritativos, respuestas verificables, flujos específicos, contexto completo para el operador y confiabilidad medible. Fuente: [anuncio oficial de Meta Business Agent](https://about.fb.com/news/2026/06/meta-business-agent/).

## Límites del producto

- Atiende ventas y soporte de **la empresa configurada**, en español, con prioridad para Argentina y Latinoamérica.
- No actúa como asistente general. Pedidos ajenos al negocio se rechazan, redirigen o derivan.
- No afirma stock, precio, política, compatibilidad ni autorización sin una fuente empresarial vigente.
- La automatización se limita a acciones explícitamente permitidas; lo dudoso pasa a una persona con contexto.
- Los mensajes de clientes no se reutilizan para entrenar modelos sin una base jurídica separada y una revisión explícita de producto, privacidad y legales.
- El único transporte admitido es la API oficial de WhatsApp Cloud de Meta. Quedan fuera WhatsApp Web, QR sessions, scraping, puppeteering, Baileys y mecanismos equivalentes.
- Cada despliegue sigue siendo monoempresa. Multi-tenancy, dashboard, CRM, WooCommerce y broadcasts no forman parte de este corte.

## Implementado y demostrable localmente

- persistencia de cliente, conversación, mensajes, escalaciones, conocimiento y trazas;
- intake validado e idempotencia del inbound por ID de WhatsApp;
- clasificación determinística y decisiones seguras de respuesta o derivación;
- recuperación de conocimiento verificado y contexto configurable de empresa;
- IA y entrega saliente detrás de banderas seguras, con `dry_run` sin Meta;
- challenge GET y autenticidad POST con HMAC-SHA256 sobre los bytes crudos;
- ciclo durable de callbacks `sent`, `delivered`, `read`, `failed`, eventos desconocidos y `wamid` sin correspondencia;
- historial de evidencia append-only, deduplicación y agregado monotónico;
- prueba offline descartable: `cd backend && npm run inspect:whatsapp-delivery`.

Los fixtures de bicicletería que permanezcan son datos ficticios de demostración. No deben presentarse como datos aprobados de una empresa real.

## Todavía no probado

- webhook recibido desde infraestructura real de Meta;
- firma real validada detrás de un proxy HTTPS de producción;
- aceptación saliente real con un `wamid` emitido por Meta;
- callbacks reales `sent`, `delivered` o `read` reconciliados;
- recepción observada en un teléfono autorizado;
- token permanente, rotación de secretos, monitoreo y rollback en producción;
- calidad con información comercial real aprobada e integraciones autoritativas.

Una simulación de callback, una aceptación HTTP de Meta y un mensaje observado en un teléfono son tres evidencias diferentes. Ninguna debe sustituir a otra.
