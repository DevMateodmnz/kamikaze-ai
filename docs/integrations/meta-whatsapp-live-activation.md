# Activación controlada de Meta WhatsApp

**Estado:** el repositorio contiene challenge, validación HMAC, parsing de texto y sender Cloud API, pero no contiene prueba creíble de conectividad Meta real. Esta lista separa preparación de código de acceso humano y evidencia de proveedor.

## Código preparado

- `GET /api/v1/security/whatsapp/webhook`: verifica `hub.mode`, token y devuelve challenge.
- `POST /api/v1/security/whatsapp/webhook`: exige `WHATSAPP_ENABLED=true`, App Secret y `X-Hub-Signature-256` válido sobre bytes crudos.
- parser de mensajes de texto; media, interactive y callbacks sin texto devuelven `200 ignored`.
- pipeline durable e idempotente por `Message.whatsappMessageId` único.
- sender Cloud API detrás de `WHATSAPP_OUTBOUND_ENABLED` y modo `live|dry_run`.
- fallas de red o HTTP quedan en el trace como `delivery_failed`, `sent=false`.

## Acceso y datos que debe aportar una persona autorizada

- [ ] cuenta Meta Business y WhatsApp Business habilitadas;
- [ ] Meta App asociada a la cuenta correcta;
- [ ] número de prueba o número comercial aprobado;
- [ ] `WHATSAPP_PHONE_NUMBER_ID`;
- [ ] token de acceso vigente con permisos mínimos necesarios;
- [ ] `WHATSAPP_VERIFY_TOKEN` generado para esta instalación;
- [ ] `WHATSAPP_APP_SECRET`;
- [ ] URL pública HTTPS estable hacia `/api/v1/security/whatsapp/webhook`;
- [ ] lista de destinatarios/números de prueba autorizados;
- [ ] ventana de prueba, responsable y canal de rollback.

Nunca pegue valores reales en este documento, Git, capturas públicas o salida de consola.

## Postura de banderas

Antes de la ventana:

```text
WHATSAPP_ENABLED=false
WHATSAPP_OUTBOUND_ENABLED=false
WHATSAPP_OUTBOUND_MODE=dry_run
AI_CLASSIFICATION_ENABLED=false
AI_REPLIES_ENABLED=false
ESCALATION_EMAIL_ENABLED=false
```

Habilite primero recepción, luego salida, y mantenga IA y correo apagados durante la prueba Meta inicial. La activación con credenciales faltantes debe fallar de forma visible: webhook POST sin App Secret devuelve error; salida live sin token o Phone Number ID devuelve `config_missing` y `sent=false`.

## Configuración en Meta

- [ ] Registrar la URL pública HTTPS y el verification token.
- [ ] Completar el challenge y guardar evidencia sanitizada del `200`.
- [ ] Suscribir, como mínimo, el campo `messages` permitido por la configuración actual de WhatsApp Cloud API.
- [ ] Confirmar que el proxy conserva el cuerpo exacto para HMAC y el header `X-Hub-Signature-256`.
- [ ] Restringir pruebas a números autorizados; no usar clientes reales.
- [ ] Verificar versión API configurada en `WHATSAPP_API_VERSION` contra la versión aceptada por Meta en ese momento.

## Pruebas obligatorias

### 1. Challenge

**PASS:** Meta acepta la suscripción; el log sanitario muestra ruta, status `200` y timestamp, sin token.

**FAIL:** token incorrecto aceptado, challenge alterado o secreto expuesto.

### 2. Firma y entrada real

1. Enviar un texto desde un número autorizado.
2. Confirmar firma válida y respuesta HTTP `200`.
3. Capturar, sanitizados: timestamp, ID `wamid`, ID interno de mensaje y conversación.
4. Confirmar una fila INBOUND y que cliente/conversación fueron resueltos.
5. Enviar firma inválida/tampered en prueba controlada y exigir `401`.

**PASS:** mensaje auténtico persistido una vez y firma inválida rechazada.

### 3. Salida real

1. Mantener IA/correo apagados.
2. Activar `WHATSAPP_OUTBOUND_ENABLED=true` y `WHATSAPP_OUTBOUND_MODE=live` solo durante la ventana.
3. Usar un destinatario autorizado.
4. Capturar ID de mensaje devuelto por Meta, status HTTP, ID OUTBOUND interno y trace `sent=true`, sin token ni teléfono completo.

**PASS:** Meta acepta la solicitud, devuelve ID y el backend registra `delivered`/`sent=true` en la respuesta de procesamiento.

**FAIL:** se afirma envío basándose solo en la existencia de una fila OUTBOUND o en `dry_run`.

### 4. Callback de estado

La arquitectura actual ignora callbacks sin texto y no guarda estados delivered/read/failed.

- [ ] Confirmar que el callback recibe `200 ignored` para evitar retries.
- [ ] Registrar esta limitación en el acta.
- [ ] No marcar “trazabilidad de estado” como aprobada.

La persistencia de callbacks de estado es trabajo futuro y solo debe exigirse si se incorpora al alcance del piloto.

### 5. Duplicado

Reenviar exactamente el mismo payload/`wamid` con firma válida.

**PASS:** segunda respuesta indica duplicado; sigue existiendo una sola fila INBOUND, una sola respuesta OUTBOUND y como máximo una derivación correspondiente.

### 6. Falla y rollback

- [ ] Simular token inválido o indisponibilidad dentro de la ventana controlada.
- [ ] Confirmar `sent=false`/`delivery_failed` y mensaje entrante conservado.
- [ ] Desactivar inmediatamente `WHATSAPP_OUTBOUND_ENABLED`.
- [ ] Si la entrada debe detenerse, desactivar `WHATSAPP_ENABLED` o retirar la suscripción en Meta.
- [ ] Confirmar que no quedan retries no observados.

## Evidencia a conservar

- fecha, zona horaria, responsable y versión/commit desplegado;
- entorno y banderas (nombres/estados, nunca valores secretos);
- IDs Meta sanitizados, IDs internos y estados HTTP;
- conteos antes/después para mensajes y derivaciones;
- logs sanitizados de firma válida/inválida, duplicado y falla;
- captura de configuración de suscripción sin secretos;
- decisión PASS/FAIL por cada prueba y procedimiento de rollback ejecutado.

## Secretos y rotación

- almacenar secretos en el mecanismo del entorno, nunca en `.env` versionado;
- conceder permisos mínimos y usar token de duración apropiada;
- rotar token/App Secret si aparecen en una terminal compartida, ticket o captura;
- después de rotar, repetir challenge, firma, entrada y salida;
- revocar credenciales temporales al terminar la ventana.

## Criterio global

**Activación aprobada** solo si challenge, firma, entrada, salida, duplicado, falla y rollback pasan con evidencia sanitizada. El callback de estado se documenta como no soportado. Cualquier prueba sin evidencia queda **pendiente**, no “completa”.
