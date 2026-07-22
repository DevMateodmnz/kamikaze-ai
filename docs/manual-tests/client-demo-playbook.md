# Playbook de Demo para Clientes — Kamikaze AI

**Audiencia**: Mateo presentando Kamikaze AI a dueños de comercios (bicicleterías, comercios pequeños).  
**Idioma de presentación**: Español (Rioplatense).  
**Duración estimada**: 15–20 minutos con demo en vivo.

---

## A. Posicionamiento del MVP

Kamikaze AI es un **asistente comercial por WhatsApp** para un comercio concreto. Funciona como primera línea de atención automatizada: responde consultas frecuentes con datos verificados de tu negocio, guía a clientes hacia los próximos pasos útiles, y **escala a una persona real** cuando algo requiere criterio humano.

### Lo que hace

| Capacidad | Explicación en lenguaje de negocio |
|-----------|-----------------------------------|
| **Responde consultas frecuentes** | Horarios, ubicación, métodos de pago, envíos — sin que un empleado tenga que tipear lo mismo 50 veces por día. |
| **Guía interés de compra** | Cuando alguien pregunta por productos, responde con tus categorías y orienta la conversación. |
| **Escala casos importantes** | Quejas, pedidos de descuento, consultas de stock, garantías, y pedidos explícitos de hablar con una persona — todo eso va directo a un humano con contexto. |
| **Funciona 24/7** | Responde automáticamente incluso fuera del horario comercial. |
| **Usa datos de TU negocio** | Nombre, horarios, ubicación, métodos de pago, política de envíos — todo configurable sin tocar código. |

### Lo que NO hace (a propósito)

- **No inventa stock ni precios** — las consultas de disponibilidad y precio siempre escalan a un humano. Un bot no puede afirmar que hay stock si no lo sabe con certeza.
- **No reemplaza a las personas** — los casos sensibles (quejas, garantías, descuentos) siempre llegan a un humano. Kamikaze reduce la carga repetitiva, no elimina la atención humana.
- **No incluye catálogo de productos, dashboard, CRM ni pagos** — es un asistente de primera línea, no un sistema completo de e-commerce.

### Cómo explicarlo en 30 segundos

> "Kamikaze AI es un asistente que atiende tu WhatsApp. Responde lo repetitivo — horarios, ubicación, métodos de pago — para que vos y tu equipo se enfoquen en lo que importa: vender y atender bien. Cuando algo necesita criterio humano, te lo deriva con toda la información que juntó. Es configurable para tu negocio y no requiere instalar nada raro."

---

## B. Prerrequisitos de la Demo

### Antes de empezar la demo

Ejecutar en orden, idealmente 5 minutos antes de la reunión:

```bash
# 1. Levantar PostgreSQL (en Docker)
docker compose up -d postgres

# 2. Instalar dependencias y preparar base de datos
cd backend
npm install
npx prisma generate
npx prisma db push

# 3. Copiar el archivo de entorno demo
cp .env.demo.example .env

# 4. Sembrar la base de conocimiento
npm run seed:kb

# 5. Iniciar el backend en modo demo
npm run demo
```

### Verificar que todo está listo

```bash
# Backend respondiendo
curl http://localhost:3000/health
# → {"status":"ok",...}

# Base de datos conectada
curl http://localhost:3000/health/ready
# → {"status":"ok","checks":{"database":"ok"},...}
```

### Lo que debe estar ACTIVADO

| Variable | Valor | Motivo |
|----------|-------|--------|
| `WHATSAPP_OUTBOUND_ENABLED` | `true` | Permite el envío simulado |
| `WHATSAPP_OUTBOUND_MODE` | `dry_run` | Simula WhatsApp sin llamar a Meta |
| `AI_CLASSIFICATION_ENABLED` | `false` | Usa detección por palabras clave (sin costo) |
| `AI_REPLIES_ENABLED` | `false` | Usa respuestas predefinidas (predecibles) |

El archivo `backend/.env.demo.example` ya viene con estos valores. Solo copialo a `.env`.

### Lo que debe estar DESACTIVADO

| Variable | Valor | Motivo |
|----------|-------|--------|
| `ESCALATION_EMAIL_ENABLED` | `false` | Sin credenciales SMTP, no queremos errores |
| `WHATSAPP_OUTBOUND_MODE` | `dry_run` (no `live`) | Evita llamadas accidentales a Meta |

### Cómo confirmar que NO estamos llamando a Meta

Cada respuesta del backend en modo dry-run incluye:
```json
"outboundDelivery": {
  "attempted": true,
  "sent": false,
  "reason": "dry_run"
}
```

`"sent": false` y `"reason": "dry_run"` confirman que no se llamó a la API de Meta. El campo `wouldSend` muestra **lo que se hubiera enviado**, sin enviarlo realmente.

---

## C. Guion de la Demo

La demo usa la bicicletería **Kamikaze Bikes** como negocio de ejemplo. Son 8 escenarios que cubren todo el flujo. Cada uno se corre con un comando `curl` o se ejecutan todos juntos con `./scripts/demo-dry-run.sh`.

Ejecutar el script automatizado **o** ir paso a paso. Recomiendo el script automatizado porque muestra los resultados formateados con colores.

```bash
./scripts/demo-dry-run.sh
```

Si preferís hacerlo manual para poder ir explicando, acá están los 8 pasos:

---

### Demo 1 — Saludo inicial

**Mensaje del cliente**:
```
Hola, buenos días
```

**Comportamiento esperado**:
- Intención detectada: `greeting`
- Acción: `reply`
- Origen de la respuesta: `template`
- La respuesta incluye "Kamikaze Bikes"

**Qué explicar mientras se muestra**:
> "El asistente reconoce que es un saludo. Responde automáticamente con el nombre de tu negocio. Esto pasa 50 veces por día en cualquier comercio — ahora es automático."

**¿Responde o escala?**: Responde directo.  
**¿Qué recibe el operador?**: Nada — es una respuesta automática segura.

**Comando manual**:
```bash
curl -s -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"whatsappMessageId":"demo-001","from":"+15550000001","text":"Hola, buenos días"}' | jq .
```

---

### Demo 2 — Disponibilidad de producto (escala a humano)

**Mensaje del cliente**:
```
¿Tienen bicicletas rodado 29 disponibles?
```

**Comportamiento esperado**:
- Intención detectada: `stock_question`
- Acción: `escalate`
- Motivo de escalación: `stock_confirmation_required`
- **No hay outboundDelivery** — no se envía respuesta por WhatsApp

**Qué explicar mientras se muestra**:
> "Acá el cliente pregunta si hay stock de un producto específico. Fijate que el asistente NO responde con 'sí, tenemos'. Lo escala directo a un humano. ¿Por qué? Porque un bot nunca debería afirmar que hay stock si no está 100% seguro. Preferimos escalar a que mienta."

**¿Responde o escala?**: Escala.  
**¿Qué recibe el operador?**: Un registro de escalación con:
- Teléfono del cliente
- Mensaje original: "¿Tienen bicicletas rodado 29 disponibles?"
- Intención detectada: `stock_question`
- Motivo: `stock_confirmation_required`
- El operador revisa el stock real y responde personalmente.

**Comando manual**:
```bash
curl -s -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"whatsappMessageId":"demo-002","from":"+15550000002","text":"¿Tienen bicicletas rodado 29 disponibles?"}' | jq .
```

---

### Demo 3 — Horarios

**Mensaje del cliente**:
```
¿Cuáles son los horarios?
```

**Comportamiento esperado**:
- Intención detectada: `store_hours`
- Acción: `reply`
- La respuesta incluye el texto configurado en `COMPANY_HOURS`

**Qué explicar**:
> "Horarios de atención. Pregunta clásica. El asistente responde con los horarios que vos configuraste. Cambiás el horario en un archivo de configuración, y la respuesta se actualiza sin tocar código."

**¿Responde o escala?**: Responde directo.  
**¿Qué recibe el operador?**: Nada.

**Comando manual**:
```bash
curl -s -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"whatsappMessageId":"demo-003","from":"+15550000003","text":"¿Cuáles son los horarios?"}' | jq .
```

---

### Demo 4 — Ubicación

**Mensaje del cliente**:
```
¿Dónde queda el local?
```

**Comportamiento esperado**:
- Intención detectada: `store_location`
- Acción: `reply`
- La respuesta incluye `COMPANY_LOCATION`

**Qué explicar**:
> "Otra pregunta de todos los días: '¿dónde están?'. Respuesta automática con la dirección que vos configuraste."

**¿Responde o escala?**: Responde directo.

**Comando manual**:
```bash
curl -s -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"whatsappMessageId":"demo-004","from":"+15550000004","text":"¿Dónde queda el local?"}' | jq .
```

---

### Demo 5 — Métodos de pago

**Mensaje del cliente**:
```
¿Aceptan transferencia o tarjeta?
```

**Comportamiento esperado**:
- Intención detectada: `payment_methods`
- Acción: `reply`
- La respuesta incluye `COMPANY_PAYMENT_METHODS`

**Qué explicar**:
> "Consulta de métodos de pago. El asistente responde con todo lo que aceptás: efectivo, tarjeta, transferencia, cuotas. Información que cambia poco pero la preguntan todo el tiempo."

**¿Responde o escala?**: Responde directo.

**Comando manual**:
```bash
curl -s -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"whatsappMessageId":"demo-005","from":"+15550000005","text":"¿Aceptan transferencia o tarjeta?"}' | jq .
```

---

### Demo 6 — Envíos

**Mensaje del cliente**:
```
¿Hacen envíos a Lules o San Miguel?
```

**Comportamiento esperado**:
- Intención detectada: `shipping`
- Acción: `reply`
- La respuesta incluye `COMPANY_SHIPPING_POLICY`

**Qué explicar**:
> "Consulta de envíos. El asistente responde con tu política de envíos. Si la respuesta no es suficiente, el cliente puede pedir hablar con un asesor."

**¿Responde o escala?**: Responde directo.

**Comando manual**:
```bash
curl -s -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"whatsappMessageId":"demo-006","from":"+15550000006","text":"¿Hacen envíos a Lules o San Miguel?"}' | jq .
```

---

### Demo 7 — Queja (escala a humano)

**Mensaje del cliente**:
```
Tengo una queja, la bici llegó con un problema
```

**Comportamiento esperado**:
- Intención detectada: `complaint`
- Acción: `escalate`
- Motivo: `customer_expressed_dissatisfaction`
- **No hay outboundDelivery** — el bot no responde a una queja

**Qué explicar**:
> "Esto es clave. Un cliente insatisfecho. El asistente NO intenta resolverlo solo — escala inmediatamente. El mensaje del cliente, el motivo de la queja, y todo el contexto queda registrado para que un humano lo atienda. Una queja manejada por un bot es peor que una queja no respondida."

**¿Responde o escala?**: Escala.  
**¿Qué recibe el operador?**: Registro de escalación con:
- Teléfono del cliente
- Mensaje completo: "Tengo una queja, la bici llegó con un problema"
- Intención: `complaint`
- Motivo: `customer_expressed_dissatisfaction`
- El operador revisa y contacta al cliente personalmente.

**Comando manual**:
```bash
curl -s -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"whatsappMessageId":"demo-007","from":"+15550000007","text":"Tengo una queja, la bici llegó con un problema"}' | jq .
```

---

### Demo 8 — Solicitud explícita de hablar con un humano

**Mensaje del cliente**:
```
Quiero hablar con una persona por una compra
```

**Comportamiento esperado**:
- Intención detectada: `human_request`
- Acción: `escalate`
- Motivo: `explicit_human_request`
- **No hay outboundDelivery**

**Qué explicar**:
> "El cliente pide explícitamente hablar con una persona. El asistente respeta eso — no insiste en responder solo. Escala con todo el contexto para que el humano sepa de qué viene la consulta."

**¿Responde o escala?**: Escala.  
**¿Qué recibe el operador?**: Registro de escalación con:
- Teléfono del cliente
- Mensaje: "Quiero hablar con una persona por una compra"
- Intención: `human_request`
- Motivo: `explicit_human_request`

**Comando manual**:
```bash
curl -s -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"whatsappMessageId":"demo-008","from":"+15550000008","text":"Quiero hablar con una persona por una compra"}' | jq .
```

---

### Cierre de la demo — Escalaciones activas

```bash
curl -s http://localhost:3000/api/v1/escalations/active | jq .
```

Mostrar que los 3 casos de escalación (stock, queja, humano) quedaron registrados y pendientes de atención. Esto demuestra que el operador tiene un tablero claro de qué atender.

---

## D. Guion de Ventas (Talk Track)

Este es el discurso que Mateo puede usar durante la presentación. Está en español rioplatense, natural, como si estuviera conversando con el dueño de un comercio. Adaptalo a tu estilo.

### Apertura

> "Bueno, [nombre], gracias por el tiempo. Les voy a mostrar algo que armamos para resolver un problema que tienen todos los comercios que atienden por WhatsApp."

### El problema

> "¿Cuántos mensajes de WhatsApp reciben por día? ¿50, 100? La mitad son siempre lo mismo: '¿qué horario tienen?', '¿dónde quedan?', '¿aceptan tarjeta?'. Son preguntas importantes, pero no hace falta que un empleado esté tipeando la misma respuesta 50 veces por día. Eso desgasta al equipo, demora la respuesta, y te saca tiempo para lo que de verdad vende: atender al cliente que ya está listo para comprar."

### La solución

> "Kamikaze AI es un asistente que automatiza esa primera línea de atención en WhatsApp. El cliente escribe, el asistente entiende qué quiere — si es un saludo, una consulta de horario, una queja, un pedido de descuento — y actúa en consecuencia."

### Encuadre de la demo

> "Les voy a mostrar cómo funciona con un ejemplo concreto: una bicicletería, Kamikaze Bikes. Pero esto se configura para cualquier comercio — cambiás el nombre, los horarios, la ubicación, los productos, y listo. Voy a mandar mensajes como si fuera un cliente, y van a ver cómo responde el asistente en tiempo real."

### Propuesta de valor

> "Miren lo que hace: saluda, pasa horarios, ubicación, métodos de pago — automático. Pero cuando alguien pregunta '¿tenés tal bici en stock?' o 'estoy enojado, esto vino fallado', el asistente no inventa. Escala directo a un humano, con toda la información que juntó, para que lo atiendas personalmente."

> "El valor es este: tu equipo deja de gastar tiempo en lo repetitivo y se enfoca en lo que importa. El cliente recibe respuesta inmediata para lo simple, y atención humana para lo delicado."

### Limitaciones honestas

> "Quiero ser claro con lo que esto NO hace. No es un sistema de inventario — no sabe cuántas bicis tenés en stock. No es un catálogo de productos ni un CRM. No reemplaza a las personas — los casos importantes siempre llegan a un humano. Y para mandar mensajes por WhatsApp posta, necesitamos las credenciales de Meta, que es el paso siguiente."

### Próximo paso

> "Esto que vieron ahora es el backend funcionando en seco — sin llamar a Meta. Cuando tengamos las credenciales de WhatsApp Business, el mismo código manda mensajes de verdad. El paso siguiente es conseguir esas credenciales, configurar el túnel HTTPS, y hacer una prueba controlada con un par de clientes reales."

---

## E. Limitaciones Honestas

Esto es importante decirlo ANTES de que el cliente pregunte. Ser transparente genera confianza.

| Limitación | Explicación |
|-----------|-------------|
| **Validación real de WhatsApp requiere credenciales Meta** | La demo funciona en modo dry-run (simulado). Para enviar y recibir mensajes reales por WhatsApp, necesitás un token de acceso de Meta WhatsApp Business API, un Phone Number ID, y una URL pública con HTTPS. Sin eso, el backend funciona pero no entrega a WhatsApp real. |
| **No responde stock ni precios exactos** | Las consultas de disponibilidad y precio escalan a un humano por diseño. El asistente no tiene conexión a un sistema de inventario — no puede ni debe afirmar cuántas unidades hay ni a qué precio. |
| **No incluye catálogo de productos** | El asistente menciona categorías de productos (MTB, ruta, gravel, etc.) pero no tiene un catálogo navegable con fichas técnicas, fotos, ni sincronización con inventario. |
| **No incluye dashboard, CRM ni pagos** | No hay panel de administración visual, no hay gestión de clientes (CRM), no hay pasarela de pagos. Es un asistente de primera línea, no un sistema completo de e-commerce. |
| **Sigue necesitando un humano** | Casos sensibles (quejas, garantías, descuentos, pedidos explícitos de hablar con una persona) siempre escalan. El asistente reduce la carga repetitiva, no elimina la atención humana. |
| **Respuestas generadas por IA están bloqueadas por defecto** | Las respuestas a clientes no son generadas por IA en esta versión. Son respuestas predefinidas con datos de tu negocio. La generación por IA existe como capacidad pero está desactivada (`AI_REPLIES_ENABLED=false`) para evitar alucinaciones o respuestas incorrectas. |
| **Un comercio por despliegue** | El MVP está diseñado para un comercio a la vez (single-tenant). No soporta múltiples comercios en la misma instancia. |

---

## F. Próximos Pasos Después de la Demo

Checklist para Mateo una vez que el cliente muestra interés:

### 1. Obtener credenciales Meta WhatsApp Business
- Crear o usar una cuenta de Meta Developer: https://developers.facebook.com
- Crear una app tipo "Business"
- Agregar el producto "WhatsApp"
- Obtener: Phone Number ID, Access Token, App Secret
- Ver guía completa: [WhatsApp Outbound Sandbox](whatsapp-outbound-sandbox.md)

### 2. Configurar túnel HTTPS público
- Opción A (recomendada para prueba local): `ngrok http 3000`
- Opción B: `cloudflared tunnel --url http://localhost:3000`
- Opción C: Desplegar en un servidor con dominio y SSL

### 3. Ejecutar preflight de WhatsApp
```bash
./scripts/whatsapp-live-preflight.sh
```
Este script verifica que todas las variables de entorno, flags y tests estén listos antes de intentar la validación real.

### 4. Validar webhook entrante
- Configurar el webhook de Meta apuntando a: `https://<tu-url>/api/v1/security/whatsapp/webhook`
- Verificar que Meta acepta el handshake (HTTP 200)
- Suscribirse a los eventos `messages`

### 5. Validar entrega saliente
- Enviar un mensaje de prueba desde un teléfono sandbox de Meta
- Verificar: `outboundDelivery.sent=true`, `outboundDelivery.reason=delivered`
- Confirmar que el teléfono recibe la respuesta en WhatsApp

### 6. Activar notificaciones por email
- Configurar `ESCALATION_EMAIL_ENABLED=true`
- Configurar credenciales SMTP reales (Gmail App Password recomendado)
- Verificar que las escalaciones disparan email al operador

### 7. Cargar perfil real del negocio
- Editar `backend/.env` con los datos del comercio:
  - `COMPANY_NAME`
  - `COMPANY_HOURS`, `COMPANY_LOCATION`, `COMPANY_PAYMENT_METHODS`
  - `COMPANY_SHIPPING_POLICY`, `COMPANY_WARRANTY_POLICY`
  - `COMPANY_PRODUCT_CATEGORIES`
- Opcional: crear `data/kb-verified.json` con respuestas verificadas de la base de conocimiento
- Volver a sembrar: `cd backend && npm run seed:kb`
- Guía: [Business Profile Setup](../deployment/business-profile.md)

### 8. Pilotear con clientes reales controlados
- Empezar con 2–3 clientes de confianza
- Modo `live` solo para esos números
- Monitorear escalaciones y respuestas durante 1 semana
- Ajustar configuración según feedback

---

## G. Recuperación ante Fallas

### El backend no inicia

**Síntoma**: `curl http://localhost:3000/health` no responde o da error.

**Causas probables y solución**:
1. PostgreSQL no está corriendo:
   ```bash
   docker compose up -d postgres
   ```
2. El archivo `.env` no existe o está mal copiado:
   ```bash
   cd backend && cp .env.demo.example .env
   ```
3. Las dependencias no están instaladas:
   ```bash
   cd backend && npm install
   ```
4. Prisma no está generado:
   ```bash
   cd backend && npx prisma generate && npx prisma db push
   ```
5. Arrancar con el script demo:
   ```bash
   cd backend && npm run demo
   ```

### El script de demo falla

**Síntoma**: `./scripts/demo-dry-run.sh` muestra `ERROR`.

**Causas y solución**:
- **"Backend not reachable"**: el backend no está corriendo. Ver paso anterior.
- **"Database not ready"**: la base de datos no responde. Verificar `docker compose up -d postgres` y que `DATABASE_URL` en `backend/.env` coincida con `docker-compose.yml`. La URL esperada es: `postgresql://kamikaze:kamikaze_dev_password@localhost:5432/kamikaze_db`.
- **"Neither jq nor python3 is installed"**: instalar jq:
  ```bash
  sudo apt install jq   # Linux
  brew install jq       # macOS
  ```
- **"ERROR: action=reply but outboundDelivery trace is absent"**: bug del backend — no debería pasar con la configuración demo. Verificar que `WHATSAPP_OUTBOUND_ENABLED=true` y `WHATSAPP_OUTBOUND_MODE=dry_run` están en el `.env`.

### Dry-run no muestra `wouldSend`

**Síntoma**: el campo `outboundDelivery` dice `"reason": "disabled"` en vez de `"reason": "dry_run"`.

**Solución**: Verificar que AMBAS variables estén configuradas:
```bash
WHATSAPP_OUTBOUND_ENABLED=true
WHATSAPP_OUTBOUND_MODE=dry_run
```
Si solo ponés `WHATSAPP_OUTBOUND_ENABLED=true` pero no cambiás `WHATSAPP_OUTBOUND_MODE`, el valor por defecto es `live` y como no hay credenciales, aparece como `disabled`. Usá `npm run demo` (que configura ambas) o verificá el `.env`.

### Las notificaciones por email están desactivadas

**Esto es esperado en modo demo**. `ESCALATION_EMAIL_ENABLED=false` por defecto. Las escalaciones se crean igual — se pueden ver con:
```bash
curl -s http://localhost:3000/api/v1/escalations/active | jq .
```
Para activar email, ver sección F paso 6.

### Faltan credenciales de Meta

**Esto es esperado en modo demo**. El sistema está diseñado para funcionar sin ellas en modo `dry_run`. Los campos `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET` están vacíos en `.env.demo.example` a propósito.

Si un cliente pregunta "¿y por qué no lo veo en mi WhatsApp?", explicar:
> "Porque para que los mensajes lleguen a WhatsApp de verdad, necesitamos activar la cuenta de WhatsApp Business de tu negocio en Meta. Eso requiere una verificación que hacemos juntos. Esto que ves ahora es el motor funcionando — cuando conectemos Meta, el mismo código manda a WhatsApp."

### Validación técnica antes de presentar

Use `cd backend && npm run demo:pilot`. El runner crea una base descartable y falla con código distinto de cero si no puede probar los cuatro escenarios. No cite conteos históricos de tests como si fueran el estado actual; registre la salida de la validación ejecutada para la presentación.

---

## Referencias

- [MVP Company Demo (técnico)](mvp-company-demo.md) — runbook detallado con explicación del pipeline
- [WhatsApp Dry-Run Demo (técnico)](whatsapp-dry-run-demo.md) — explicación técnica del modo dry-run
- [WhatsApp Live Sandbox](whatsapp-outbound-sandbox.md) — guía para validación con Meta real
- [Deployment Runbook](../deployment/runbook.md) — setup completo
- [Business Profile Setup](../deployment/business-profile.md) — cómo configurar para otro comercio
- `.env.example` — referencia de todas las variables de entorno
- `backend/.env.demo.example` — archivo de entorno listo para demo

---

*Última actualización: 2026-06-11*
