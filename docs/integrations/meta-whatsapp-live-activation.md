# WhatsApp oficial: arquitectura, estados y activación controlada

**Vigencia:** 14 de agosto de 2026.
**Estado:** el código y la prueba offline están implementados; no existe evidencia de tráfico real de Meta ni de recepción en un teléfono.

## 1. Qué camino usamos

Kamikaze AI usa exclusivamente la **API oficial de WhatsApp Cloud de Meta**. No se admite automatización de WhatsApp Web, sesiones QR, scraping, puppeteering, Baileys ni mecanismos no oficiales.

Conceptos que no deben confundirse:

| Opción | Qué es | Uso en este producto |
|---|---|---|
| WhatsApp Business App | Aplicación para que una pyme atienda conversaciones manualmente desde sus dispositivos. | Puede ser la operación humana del comercio; por sí sola no es la integración del backend. |
| WhatsApp Cloud API | API oficial alojada por Meta, con Graph API y webhooks. | Es el transporte programático de Kamikaze AI. Véanse [Get started](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started) y [About the platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform). |
| Activación directa de desarrollador / número de prueba | Configuración inicial dentro de una Meta App para probar con recursos y destinatarios autorizados. | Sirve para probar el transporte propio; no demuestra que un número comercial esté listo para producción. |
| Embedded Signup | Flujo oficial para que un proveedor de solución incorpore negocios y sus activos con consentimiento. | Es relevante al ofrecer onboarding a terceros; no hace falta para la primera integración directa propia. |
| Coexistencia con WhatsApp Business App | Onboarding oficial que, cuando la cuenta y el país son elegibles, permite mantener la App y sumar Platform sobre el mismo número. | Debe validarse en la consola y documentación vigente; no se presume habilitada. Véase [onboarding de usuarios de Business App](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users). |
| Meta Tech Provider o partner | Modelo para incorporar y administrar múltiples negocios, o delegar esa operación a un proveedor autorizado. | No es requisito para probar la integración directa de la propia empresa. Sí debe evaluarse antes de escalar onboarding de clientes; usar un partner reduce operación propia pero agrega dependencia y costo. |

## 2. Activos de producción

Una persona autorizada debe preparar, sin pegarlos en Git ni en tickets públicos:

- Meta Business Portfolio;
- Meta Developer App;
- WhatsApp Business Account (WABA) e ID de WABA;
- número habilitado y `WHATSAPP_PHONE_NUMBER_ID`;
- token permanente de system user con permisos mínimos y plan de rotación; véase [Access tokens](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens/);
- Meta App Secret (`WHATSAPP_APP_SECRET`);
- verify token aleatorio de esta instalación (`WHATSAPP_VERIFY_TOKEN`);
- callback HTTPS público estable: `/api/v1/security/whatsapp/webhook`;
- destinatario de prueba autorizado durante desarrollo.

Nunca registrar tokens, App Secret, verify token, headers de autorización completos ni payloads con datos innecesarios.

## 3. Comportamiento implementado

### Entrada y autenticidad

- `GET /api/v1/security/whatsapp/webhook` mantiene el challenge de suscripción.
- El POST captura los bytes crudos antes de parsear JSON y verifica `X-Hub-Signature-256` con HMAC-SHA256 y comparación constante.
- En producción falta de firma o firma inválida devuelve `401`.
- En local/test una firma ausente solo se acepta si `WHATSAPP_WEBHOOK_ALLOW_UNSIGNED_LOCAL=true`; el valor por defecto es `false` y la bandera nunca evita la verificación en producción.
- `WHATSAPP_ENABLED=false` mantiene la entrada deshabilitada.

### Ciclo de entrega durable

Al aceptar una salida, el `wamid` se asocia al `Message` OUTBOUND con agregado `PENDING`. Los callbacks reconocen `sent`, `delivered`, `read` y `failed`; preservan timestamp de proveedor, destinatario, error, conversación/pricing, evento normalizado y hora local de recepción.

Cada evento único se agrega a `WhatsAppDeliveryEvent`. Un fingerprint único colapsa el replay exacto. Eventos distintos se conservan aun cuando no cambien el agregado.

Política de estado:

```text
PENDING → SENT → DELIVERED → READ
    └──────────→ FAILED
```

- `READ` no regresa ante `DELIVERED` o `SENT` tardíos.
- `DELIVERED` no regresa ante `SENT`.
- `FAILED` es terminal si aparece antes de evidencia positiva de entrega.
- Un `FAILED` tardío después de `DELIVERED`/`READ` se conserva como evidencia, pero no borra esa evidencia positiva.
- Estados futuros desconocidos se almacenan como no reconocidos y no modifican el agregado.
- Un `wamid` desconocido crea sólo evidencia sin match; no fabrica cliente, conversación ni mensaje. El webhook responde `200` y emite un log estructurado sanitizado.

El repositorio ya contiene un baseline legado y una migración forward separados. Esto **no** significa que una base existente haya adoptado la historia. Antes de producción se debe seguir el [runbook de adopción Prisma](../deployment/prisma-migration-baseline.md), con backup y drift cero; nunca ejecutar resets.

## 4. Prueba offline

```bash
cd backend
npm run inspect:whatsapp-delivery
```

El comando crea PostgreSQL descartable, un OUTBOUND ficticio con fake `wamid`, aplica callbacks simulados `sent → delivered → read`, repite `read`, registra un evento sin match, imprime evidencia y destruye la base. Cada línea indica que es **SIMULACIÓN OFFLINE**: no llama a Meta ni demuestra recepción en un teléfono.

## 5. Banderas iniciales seguras

```text
WHATSAPP_ENABLED=false
WHATSAPP_OUTBOUND_ENABLED=false
WHATSAPP_OUTBOUND_MODE=dry_run
WHATSAPP_WEBHOOK_ALLOW_UNSIGNED_LOCAL=false
AI_CLASSIFICATION_ENABLED=false
AI_REPLIES_ENABLED=false
ESCALATION_EMAIL_ENABLED=false
```

Activar primero la entrada en una ventana controlada. Activar salida `live` sólo después de verificar firma, persistencia, destinatario y rollback. La salida real permanece deshabilitada por defecto.

## 6. Checklist credential-safe para validación real

1. Registrar commit, fecha, zona horaria, responsable y entorno, sin valores secretos.
2. Confirmar callback HTTPS y que el proxy no altere body ni header de firma.
3. Completar challenge GET con verify token almacenado fuera de Git.
4. Enviar un texto desde el destinatario autorizado.
5. Confirmar firma válida, `200`, una sola fila INBOUND y procesamiento terminado.
6. Repetir exactamente el payload y confirmar que no aparece otra respuesta comercial.
7. Mantener IA y correo apagados; habilitar salida oficial sólo durante la prueba.
8. Confirmar intento OUTBOUND y que Meta **aceptó la solicitud** devolviendo un `wamid`.
9. Confirmar callbacks reales `sent`, `delivered` e idealmente `read`, asociados al OUTBOUND.
10. Confirmar el mensaje visualmente en el teléfono autorizado.
11. Probar firma inválida (`401`) y falla de token/red de manera controlada.
12. Deshabilitar salida, revisar logs por secretos y conservar sólo evidencia sanitizada.

### Evidencia exacta de éxito

La prueba real sólo queda aprobada si contiene separadamente:

- webhook inbound capturado;
- firma validada;
- mensaje persistido una vez;
- procesamiento completado;
- outbound intentado;
- Meta aceptó el outbound y devolvió `wamid`;
- callbacks `sent`, `delivered` e idealmente `read` reconciliados;
- mensaje observado en el teléfono autorizado;
- ninguna respuesta comercial duplicada;
- ningún secreto en logs o Git.

“Meta aceptó la solicitud” no equivale a “Meta informó delivered”, y ninguno equivale por sí solo a “una persona lo vio en su teléfono”.

## 7. Políticas y uso acotado

- El producto automatiza soporte y ventas de la empresa configurada; no es un asistente general.
- La IA debe permanecer acotada a información verificada y flujos autorizados de esa empresa.
- Pedidos ajenos se rechazan, redirigen o pasan a una persona.
- La automatización debe ofrecer una ruta clara de escalación humana.
- Los mensajes de clientes no se usan para entrenamiento sin otra base jurídica y revisión explícita de producto/legal.
- Fuera de la ventana de servicio aplican templates aprobados y las políticas vigentes de WhatsApp; revisar siempre la [Business Policy](https://whatsappbusiness.com/policy/) antes de activar.

## 8. Precio: dato externo, no constante del código

La página oficial vigente indica cobro por mensaje **entregado**, según mercado y categoría. Los mensajes de servicio en la ventana de atención de 24 horas iniciada por el cliente son actualmente gratuitos; las categorías cobrables y templates varían por mercado. Consultar la [página oficial de precios](https://whatsappbusiness.com/products/platform-pricing/) en cada propuesta y activación. No hardcodear tarifas ni tratarlas como un hecho eterno.

## 9. Lo que sigue sin probar

- credenciales y activos reales configurados correctamente;
- ingreso firmado desde Meta detrás del HTTPS de producción;
- aceptación real saliente;
- callbacks reales y recepción en teléfono;
- coexistencia/Embedded Signup para un comercio concreto;
- operación sostenida, alertas, rotación de secretos y recuperación.
