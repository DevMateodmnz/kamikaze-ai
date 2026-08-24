# Kamikaze AI — Machete de Demo MVP y Próximos Pasos

## Estado actual

Kamikaze AI está en estado **MVP Release Candidate**.

Eso significa:

- La demo está lista para presentar en **modo dry-run**.
- El código está listo para validación con **Meta WhatsApp Cloud API**.
- La validación real con WhatsApp todavía depende de conseguir credenciales de Meta y una URL pública HTTPS.
- No hay que venderlo como “ya está conectado al WhatsApp real” si todavía no se hicieron esos pasos.
- La demo no llama a servicios externos ni gasta mensajes reales.

## Último commit de demo

**Commit:** `5157be1`  
**Mensaje:** `docs(demo): add client MVP playbook`

### Archivos modificados

| Archivo | Cambio |
|---|---|
| `docs/manual-tests/client-demo-playbook.md` | Nuevo playbook completo en español, 557 líneas |
| `README.md` | Link al playbook |

## Validaciones actuales

| Comando | Resultado |
|---|---|
| `npm run build` | Limpio, 0 errores |
| `git diff --check` | Limpio |
| `npm test` | 509/510, con 1 falla pre-existente documentada por credenciales DB |

La falla restante no fue introducida por el MVP. Es un problema ambiental de credenciales de base de datos en tests.

## Cómo correr la demo dry-run

Desde el proyecto, iniciar el backend en modo demo:

```bash
npm run demo
```

Luego correr el script de demo:

```bash
./scripts/demo-dry-run.sh
```

La demo usa modo `dry_run`, por lo tanto:

- no llama a Meta;
- no envía WhatsApps reales;
- muestra qué mensaje se habría enviado;
- permite presentar el flujo sin depender de credenciales externas.

## Qué decir antes de mostrar la demo

Decir algo parecido a esto:

> Esta demo está corriendo en modo seguro. No está enviando mensajes reales por WhatsApp todavía. Lo que estamos mostrando es el flujo completo del asistente: cómo interpreta consultas, cómo responde con información verificada, cómo detecta intención de compra y cómo deriva a una persona cuando no debe inventar información. La conexión real con WhatsApp se activa después con las credenciales de Meta.

## Flujo de demo actual

| # | Mensaje del cliente | Intención | Acción esperada |
|---|---|---|---|
| 1 | `Hola, buenos días` | `greeting` | Responde |
| 2 | `¿Tienen bicicletas rodado 29 disponibles?` | `stock_question` | Escala |
| 3 | `¿Cuáles son los horarios?` | `store_hours` | Responde |
| 4 | `¿Dónde queda el local?` | `store_location` | Responde |
| 5 | `¿Aceptan transferencia o tarjeta?` | `payment_methods` | Responde |
| 6 | `¿Hacen envíos a Lules o San Miguel?` | `shipping` | Responde |
| 7 | `Tengo una queja, la bici llegó con un problema` | `complaint` | Escala |
| 8 | `Quiero hablar con una persona por una compra` | `human_request` | Escala |

## Valor comercial que hay que explicar

Kamikaze AI no se vende como “un chatbot lindo”.

Se vende como:

> Un asistente comercial de WhatsApp que reduce la atención repetitiva, responde preguntas comunes con datos verificados, califica consultas de compra y deriva a un humano solo cuando hace falta.

El dolor del cliente es que alguien tiene que estar contestando siempre lo mismo:

- horarios;
- ubicación;
- medios de pago;
- envíos;
- garantías;
- consultas generales;
- primeras preguntas de compra.

Kamikaze reduce esa carga y deja al humano para casos importantes.

## Qué NO prometer todavía

No prometer:

- que ya está validado con WhatsApp real si no se configuró Meta;
- que elimina el 100% del trabajo humano;
- que responde precios exactos si no hay inventario o base de datos conectada;
- que confirma stock exacto si no hay integración;
- que genera ventas/cobros automáticamente;
- que tiene dashboard;
- que tiene CRM;
- que ya sincroniza catálogo;
- que crea publicaciones automáticamente;
- que toma información real de la web/base de datos del cliente si todavía no se integró.

## Qué sí se puede prometer

Sí se puede decir:

- Está listo para demo en modo seguro.
- Está diseñado para una empresa concreta.
- Responde con datos verificados del negocio.
- Evita inventar información sensible.
- Escala reclamos, dudas raras, precios/stock no verificados y pedidos humanos.
- Guarda contexto útil para que el humano sepa qué pasó.
- Puede notificar por email si se configura SMTP.
- Está preparado para validarse con Meta cuando estén las credenciales.
- Es extensible para conectarse luego a la web/base de datos del cliente.

## Qué falta para WhatsApp real

Para validar live con Meta hace falta:

1. Crear/configurar app en Meta Developers.
2. Obtener:
   - `WHATSAPP_ACCESS_TOKEN`
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_APP_SECRET`
   - `WHATSAPP_VERIFY_TOKEN`
3. Crear una URL pública HTTPS:
   - ngrok;
   - cloudflared;
   - deploy real.
4. Configurar el webhook en Meta:
   - callback URL;
   - verify token;
   - suscripción a `messages`.
5. Activar variables:
   - `WHATSAPP_ENABLED=true`
   - `WHATSAPP_OUTBOUND_ENABLED=true`
   - `WHATSAPP_OUTBOUND_MODE=live`
6. Correr:

```bash
./scripts/whatsapp-live-preflight.sh
```

7. Mandar mensaje de prueba.
8. Verificar que `outboundDelivery.sent=true` y `reason=delivered`.

## Riesgo principal antes de presentar

El riesgo no es técnico de demo. La demo dry-run está lista.

El riesgo es de expectativa:

> Si el cliente espera ver mensajes entrando/saliendo desde su WhatsApp real, hay que explicar desde el inicio que esa parte requiere credenciales de Meta y configuración del webhook.

## Próxima idea del cliente: información desde web + base de datos

El cliente aparentemente tiene:

- una página web;
- una base de datos;
- productos cargados;
- información de envíos;
- productos con datos incompletos.

La idea sería que Kamikaze tome información desde dos fuentes:

1. **Página web**
   - textos públicos;
   - información de productos;
   - políticas;
   - envíos;
   - categorías;
   - descripción comercial.

2. **Base de datos**
   - productos reales;
   - stock;
   - precios;
   - categorías;
   - disponibilidad;
   - datos de envío;
   - estado de publicación.

Esto ya no es el MVP actual. Es una **fase 2**.

## Cómo debería pensarse la integración web + DB

La arquitectura correcta no debería ser “que la IA lea cualquier cosa libremente”.

Lo correcto sería:

1. Extraer datos desde la web y la DB.
2. Normalizarlos.
3. Guardarlos como conocimiento verificado o catálogo.
4. Hacer que la IA use solo esos datos.
5. Escalar si falta información o si hay conflicto entre fuentes.

Ejemplo:

- La web dice: “envíos a todo Tucumán”.
- La DB dice que un producto específico no tiene envío disponible.
- La IA no debería inventar. Debería priorizar la DB o escalar.

## Nueva idea: configurador de publicaciones

Lo que el cliente quiere parece ser un módulo donde la IA ayude a completar publicaciones de productos.

Ejemplo de producto incompleto:

- nombre: `Bicicleta MTB R29`
- precio: cargado
- stock: cargado
- descripción: incompleta
- fotos: faltantes
- categoría: incompleta
- detalles técnicos: faltantes

La IA podría ayudar a completar:

- título comercial;
- descripción;
- bullets de beneficios;
- categoría;
- atributos;
- SEO;
- texto para redes;
- texto para WhatsApp;
- preguntas frecuentes;
- sugerencias de fotos necesarias.

## Cuidado con las fotos

Hay que ser cuidadoso con esto.

La IA puede:

- sugerir qué fotos faltan;
- generar imágenes ilustrativas si el cliente acepta que no son fotos reales;
- ayudar a mejorar texto para fotos;
- buscar imágenes de referencia si se implementa una fuente legal/licenciada;
- pedir al humano que cargue fotos reales cuando el producto necesita precisión.

No conviene que la IA invente fotos como si fueran fotos reales del producto.

Para ecommerce, lo ideal es:

> Si el producto es real, las fotos principales deberían ser reales. La IA puede ayudar con imágenes secundarias, fondos, banners o contenido promocional, pero no reemplazar fotos reales sin aclaración.

## Fase 2 posible

Una fase 2 ordenada podría ser:

### PR/Fase A — Auditoría de fuentes del cliente

- Qué web tienen.
- Qué base de datos usan.
- Qué tablas tienen.
- Qué campos tiene producto.
- Qué campos faltan.
- Qué sistema de publicación usan.
- Cómo se actualiza stock/precio.
- Qué datos son confiables.

### PR/Fase B — Conector de catálogo read-only

- Leer productos desde la DB.
- No modificar nada todavía.
- Exponer productos al asistente.
- Permitir responder stock/precio solo desde DB.

### PR/Fase C — Knowledge sync desde web

- Extraer textos públicos de la web.
- Convertirlos en KB verificada.
- Detectar conflictos con datos internos.

### PR/Fase D — Configurador de publicaciones

- Tomar productos incompletos.
- Generar borradores de descripción.
- Generar atributos faltantes sugeridos.
- Marcar campos como “requiere revisión humana”.
- No publicar automáticamente al inicio.

### PR/Fase E — Publicación asistida

- El humano revisa.
- El humano aprueba.
- Recién ahí se publica o actualiza la web.

## Regla estratégica

No mezclar esto con la demo actual.

Para presentar ahora:

> Kamikaze MVP ya resuelve atención inicial por WhatsApp.

Para fase 2:

> Kamikaze puede evolucionar hacia un asistente conectado al catálogo real y un configurador inteligente de publicaciones.

## Próximo paso recomendado

Antes de programar web + DB + configurador, hay que pedirle al cliente información concreta:

1. ¿Qué plataforma usa la web?
2. ¿La web tiene API?
3. ¿Qué base de datos usan?
4. ¿Tienen acceso a la DB?
5. ¿Dónde están los productos?
6. ¿Qué campos tiene cada producto?
7. ¿Qué campos faltan normalmente?
8. ¿Quién aprueba una publicación antes de publicarla?
9. ¿Se puede modificar la web desde API o hay que entrar manualmente?
10. ¿Las fotos deben ser reales o aceptan imágenes generadas/ilustrativas?

## Frase para explicar la fase 2 al cliente

> La primera versión automatiza la atención comercial por WhatsApp. La segunda etapa puede conectarse al catálogo real de la empresa y ayudar a completar publicaciones de productos, siempre con revisión humana antes de publicar información sensible como precios, stock, imágenes o condiciones comerciales.
