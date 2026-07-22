# Estado del piloto para cliente

**Conclusión:** el producto está listo para una demostración local, repetible y segura. Todavía no está validado como piloto real de WhatsApp: faltan acceso y pruebas controladas en Meta, información comercial aprobada por Kamikaze y evidencia de operación con conversaciones reales.

## 1. Objetivo del producto

Kamikaze AI asiste consultas de venta y soporte que llegan por WhatsApp. La meta no es reemplazar a una persona: es responder información conocida y aprobada, registrar cada interacción y derivar a un asesor cuando la respuesta depende de stock, precio, condiciones particulares o criterio humano.

La solución sigue siendo **una instalación configurable para una empresa**. No es un SaaS multiempresa ni comparte datos entre clientes.

## 2. Avance actual

### Funciona y se puede demostrar localmente

- recepción y validación de mensajes con formato WhatsApp;
- identificación del cliente y continuidad de su conversación;
- almacenamiento de mensajes entrantes y salientes en PostgreSQL;
- detección determinística de intenciones, sin depender de IA paga;
- uso de una base de conocimiento cuando el dato local está marcado como verificado;
- derivación segura de preguntas desconocidas, de stock, precios, descuentos, garantías, reclamos o pedidos de atención humana;
- registro de la derivación con contexto útil para un asesor;
- confirmación al cliente de que un asesor continuará la conversación;
- prevención de respuestas y derivaciones duplicadas cuando Meta reintenta el mismo ID de mensaje;
- simulación de envío `dry_run`, sin contactar Meta;
- registro visible de una falla de entrega sin marcarla como enviada;
- salud del proceso y disponibilidad de la base de datos.

El comando `cd backend && npm run demo:pilot` crea una base descartable, ejecuta cuatro pruebas con aserciones y elimina todo al terminar.

### Existe código, pero falta validación con proveedores reales

- verificación de webhook y firma HMAC de Meta;
- envío saliente mediante WhatsApp Cloud API;
- notificación de derivaciones por SMTP/Gmail;
- adaptador de IA MiniMax detrás del gateway.

Tener código y pruebas con dobles locales **no demuestra** conectividad real. El repositorio no contiene evidencia sanitaria de una recepción o un envío real por Meta, ni una prueba SMTP real aprobada para este piloto.

## 3. Flujo demostrable

1. Una consulta entra al backend.
2. El sistema resuelve el cliente y una conversación activa.
3. Guarda el mensaje antes de decidir.
4. Interpreta la intención de forma determinística; si la IA está habilitada y falla, vuelve a este camino seguro.
5. Si existe una respuesta local verificada, la usa y deja trazabilidad de la entrada utilizada.
6. Si la respuesta exige información no verificada o en tiempo real, crea una derivación con el mensaje, la intención, el motivo y un resumen.
7. Guarda una confirmación para el cliente indicando que un asesor continuará.
8. La entrega se controla por bandera: la demo usa `dry_run`; una falla real se informa como `sent=false`.
9. Un reintento con el mismo ID no repite el mensaje saliente ni la derivación.

> La demo usa una ficha ficticia y explícitamente local (`kb-verified-acme.example.json`). No representa horarios, direcciones ni políticas reales de Kamikaze.

## 4. Limitaciones actuales

- No hay prueba documentada de Meta entrante ni saliente con IDs reales sanitizados.
- Falta cargar y aprobar la información real de Kamikaze; los ejemplos versionados no deben presentarse como datos de la empresa.
- No hay sincronización de inventario: stock y disponibilidad siempre pasan a una persona.
- Los callbacks de estado de Meta se reconocen como eventos no soportados y se responden sin procesar; no existe trazabilidad durable de entregado/leído.
- El gateway tiene un adaptador MiniMax; OpenAI, Gemini, Anthropic y proveedor local figuran como opciones de configuración pero no tienen adaptador implementado.
- Los artefactos n8n cubren una simulación y correo de escalación; no constituyen un flujo real de WhatsApp validado.
- La preparación de despliegue es parcial: no hay servicio backend en Compose ni historial de migraciones Prisma.
- La validación del checkpoint está verde, incluido el lint de todo `backend/src`; esto no sustituye las pruebas pendientes de proveedor y despliegue.

### Exclusiones explícitas del MVP

- panel de administración;
- inventario o catálogo sincronizado;
- multi-tenencia;
- una única instancia atendiendo varias empresas;
- autonomía total sin supervisión humana;
- promesas automáticas de stock, precio, descuento, garantía o entrega.

## 5. Próximos objetivos

1. Activar y validar Meta WhatsApp real, entrante y saliente, con números de prueba autorizados.
2. Cargar y aprobar la información real verificada de la empresa.
3. Ejecutar un piloto controlado con conversaciones seleccionadas.
4. Medir preguntas sin respuesta, derivaciones, corrección de respuestas e incidentes operativos.
5. Ajustar el asistente con evidencia del piloto.
6. Evaluar integraciones posteriores solo cuando el piloto de WhatsApp sea estable.

## 6. Definición de éxito del piloto

El piloto será exitoso cuando:

- Meta entregue mensajes reales al webhook público y el backend valide su firma;
- el sistema responda a un número autorizado y se conserve el ID de proveedor como evidencia;
- todas las respuestas comerciales usadas estén aprobadas por Kamikaze;
- ninguna consulta de stock o dato no verificado reciba una afirmación inventada;
- cada derivación sea visible, tenga contexto suficiente y llegue a un responsable;
- los reintentos de Meta no creen respuestas ni derivaciones duplicadas;
- se registren y revisen métricas de exactitud, preguntas no resueltas, derivaciones y fallas;
- exista un procedimiento probado para desactivar las integraciones sin perder el registro entrante.
