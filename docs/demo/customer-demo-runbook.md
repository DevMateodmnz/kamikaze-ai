# Demostración técnica del piloto

**Camino recomendado:** use `npm run demo:pilot`. El comando crea su propia base PostgreSQL local descartable, no abre un servidor público, no usa datos de `.env`, intercepta localmente la falla de proveedor y elimina filas y contenedor al terminar.

## Prerrequisitos

- Docker en ejecución;
- Node.js 18.18 o superior y npm;
- dependencias instaladas desde `backend/package-lock.json`;
- puertos `55433` libre (o definir `PILOT_DEMO_DB_PORT` con otro puerto local libre).

```bash
cd /home/mateo/Documents/coding/kamikaze-ai/backend
npm ci --dry-run   # verifica que lockfile e instalación estén alineados
npm run demo:pilot
```

No copie ni reemplace `.env` para este camino. No levante n8n, SMTP, Meta ni un proveedor de IA.

## Resultado esperado

El comando debe terminar con código `0` y mostrar:

```text
A known question: PASS — verified local fixture, dry_run, 2 messages, 0 escalations
B stock question: PASS — human handoff, email disabled, 2 messages, 1 escalation
C duplicate delivery: PASS — duplicate=true, no duplicate reply or escalation
D provider unavailable: PASS — delivery_failed, sent=false, inbound retained
External calls: AI=0 SMTP=0 n8n=0 Meta real=0 (failure locally intercepted=1)
Cleanup: PASS — generated records removed
```

Si una aserción falla, el proceso termina con código distinto de cero. El `trap` del script elimina el contenedor incluso ante error o interrupción.

## Escenarios y evidencia

| Escenario | Entrada local | Debe probar |
|---|---|---|
| A. Pregunta conocida | Horarios | `store_hours`, `knowledge_base`, 1 INBOUND + 1 OUTBOUND, `dry_run`, 0 derivaciones |
| B. Inventario | Disponibilidad de un modelo | `stock_question`, derivación OPEN con contexto, confirmación con “asesor”, correo `email_disabled`, `dry_run` |
| C. Duplicado | Mismo `whatsappMessageId` dos veces | segundo resultado `duplicate=true`, exactamente 1 INBOUND + 1 OUTBOUND, 0 derivaciones |
| D. Proveedor caído | Saludo con modo live interceptado | `delivery_failed`, `sent=false`, INBOUND y OUTBOUND conservados, 1 intento interceptado localmente |

La respuesta de A procede del fixture ficticio versionado `data/kb-verified-acme.example.json`. No la presente como información de Kamikaze.

## Salud esperada

El runner valida la base al ejecutar Prisma y el flujo completo. Para una instancia del servidor levantada por separado, los endpoints implementados son:

```bash
curl -s http://localhost:3000/health
# status=ok

curl -s http://localhost:3000/health/ready
# status=ok y checks.database=ok; si la DB falla devuelve HTTP 503
```

No es necesario iniciar ese servidor para `npm run demo:pilot`.

## Cómo demostrar que no hubo integraciones reales

1. El script fija `AI_CLASSIFICATION_ENABLED=false`, `AI_REPLIES_ENABLED=false` y `ESCALATION_EMAIL_ENABLED=false`.
2. A, B y C fijan `WHATSAPP_OUTBOUND_MODE=dry_run`; el sender no ejecuta `fetch`.
3. D instala un reemplazo local de `fetch` que falla antes de cualquier red y exige exactamente un intento interceptado.
4. El resumen exige `AI=0`, `SMTP=0`, `n8n=0` y `Meta real=0`.
5. El contenedor se publica solo en `127.0.0.1` y la función rechaza bases remotas o cuyo nombre no incluya `test`, `demo` o `pilot`.

## Secuencia para Mateo

### Camino de cinco minutos

1. Explique la diferencia entre demo local y Meta real.
2. Ejecute `npm run demo:pilot`.
3. En A, destaque el dato verificado y la trazabilidad.
4. En B, destaque que no inventa stock y confirma el pase a un asesor.
5. En C, explique los reintentos de Meta y la idempotencia.
6. En D, muestre `delivery_failed` y `sent=false`.
7. Cierre con el próximo hito: activación controlada de Meta.

### Camino técnico de quince minutos

1. Muestre `backend/prisma/schema.prisma`: `Customer`, `Conversation`, `Message`, `Escalation` y la unicidad de `whatsappMessageId`.
2. Muestre `messages/service.ts`: guardar primero, clasificar, usar KB o derivar, persistir salida y entregar por bandera.
3. Muestre `security/whatsapp-webhook.ts` y `security/routes.ts`: challenge, HMAC y eventos ignorados.
4. Muestre `whatsapp-sender.ts`: disabled, dry-run, configuración faltante y falla live.
5. Ejecute el demo y relacione cada PASS con su evidencia durable.
6. Abra `docs/integrations/meta-whatsapp-live-activation.md` y explique qué depende de acceso humano/proveedor.

## Reset y limpieza

No hay reset manual en el camino recomendado. El runner:

- elimina los cuatro clientes de prueba (cascade de conversaciones, mensajes y derivaciones);
- elimina la entrada KB creada para la prueba;
- desconecta Prisma;
- detiene y elimina el contenedor;
- elimina su log temporal de schema.

Comprobación opcional:

```bash
docker ps --format '{{.Names}}' | grep '^kamikaze-pilot-demo-' || true
ss -ltnH 'sport = :55433'
```

Ambos comandos deben quedar sin salida.

## Solución de problemas

| Síntoma | Acción segura |
|---|---|
| Docker no disponible | Inicie Docker; no cambie el runner a una base compartida. |
| Puerto ocupado | Use `PILOT_DEMO_DB_PORT=55434 npm run demo:pilot`; no detenga el proceso ajeno. |
| Prisma no conecta | Confirme que el contenedor se creó y que Docker permite publicar en loopback. |
| Fixture no encontrado | Ejecute desde `backend`; el script lo exige. |
| Aserción fallida | Conserve la salida sanitizada, ejecute el test focal y no presente el escenario como aprobado. |
| Queda un contenedor tras un corte abrupto | Verifique el nombre y elimine solo `kamikaze-pilot-demo-*`; no toque `kamikaze-postgres`. |
