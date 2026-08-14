# Adoptar Prisma Migrate sin recrear la base

**Resultado:** Kamikaze AI tiene dos migraciones versionadas y verificadas en PostgreSQL descartable. Crear archivos no los despliega, y esta guía no autoriza modificar la base de desarrollo de Mateo.

## Ruta rápida

| Estado real de la base | Acción |
|---|---|
| Vacía | Ejecutar `prisma migrate deploy`; se aplican baseline y forward. |
| Esquema legado anterior a `c2fa13e` | Backup, drift cero contra `c2fa13e^`, marcar sólo baseline como aplicado y ejecutar deploy. |
| Esquema actual creado con `db push` | Backup, drift cero contra `schema.prisma` actual y marcar ambas migraciones como aplicadas. No ejecutar deploy para “arreglar” drift. |
| Drift distinto de cero | **Abortar.** No ejecutar `migrate resolve`. Investigar y diseñar una migración específica. |

Antes de una adopción real, ejecute la matriz aislada:

```bash
cd backend
npm run verify:migrations
```

Ese comando crea su propio contenedor y cuatro bases únicas, valida los escenarios y elimina únicamente el contenedor que creó. No acepta una URL externa y no adopta ninguna base existente.

## Por qué existen dos migraciones

| Migración | Representa | Motivo |
|---|---|---|
| `20260814000100_baseline_legacy_schema` | Esquema completo en `0034ae2`, padre exacto de `c2fa13e`. | Permite certificar una base legado sin volver a crear sus tablas. También crea una instalación vacía. |
| `20260814000200_add_whatsapp_delivery_lifecycle` | Diferencia mecánica entre `c2fa13e^` y el esquema actual. | Agrega el ciclo de entrega sin borrar ni reescribir filas existentes. |

Git demuestra que `c2fa13e` es el único commit que afecta `schema.prisma` después del baseline seleccionado. La segunda migración agrega enums de estado/modo, tres columnas nullable en `Message`, `WhatsAppDeliveryEvent`, índices, unicidad de fingerprint y FK opcional `ON DELETE SET NULL`.

## Reglas que no se negocian

> [!WARNING]
> `prisma migrate resolve --applied` certifica que una base **ya contiene** los efectos de una migración. Sólo registra historia; no crea ni altera tablas empresariales. Nunca debe usarse para esconder drift.

- Backup verificado antes de cualquier adopción real.
- Ventana de mantenimiento y responsable identificados.
- URL obtenida desde el gestor de secretos; no pegarla en Git, tickets o capturas.
- Drift exacto igual a `No difference detected.` antes de `resolve`.
- No usar `migrate dev`, `migrate reset` ni `db push` para adoptar una base existente.
- No adoptar todavía la base de desarrollo de Mateo: primero requiere backup y drift cero revisados por una persona.

## 1. Instalación completamente nueva

La base debe estar vacía y destinada al nuevo despliegue.

```bash
cd backend
DATABASE_URL="$TARGET_DATABASE_URL" npx prisma migrate deploy
DATABASE_URL="$TARGET_DATABASE_URL" npx prisma migrate status

DATABASE_URL="$TARGET_DATABASE_URL" npx prisma migrate diff \
  --from-url "$TARGET_DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --exit-code
```

Resultado esperado: dos migraciones terminadas, status actualizado y `No difference detected.`.

## 2. Adopción de una base legado

Esta ruta corresponde únicamente a una base cuyo esquema sea el de `0034ae2`/`c2fa13e^`.

### 2.1 Backup obligatorio

```bash
umask 077
pg_dump --format=custom --no-owner --no-acl \
  --dbname="$TARGET_DATABASE_URL" \
  > /ruta/segura/kamikaze-pre-migrate.dump
```

Registre checksum, tamaño y una prueba de restauración en otro PostgreSQL antes de continuar.

### 2.2 Drift legado obligatorio

Obtenga el schema histórico sin reemplazar el working tree:

```bash
git show 'c2fa13e^:backend/prisma/schema.prisma' \
  > /tmp/kamikaze-legacy-c2fa13e-parent.prisma

cd backend
DATABASE_URL="$TARGET_DATABASE_URL" npx prisma migrate diff \
  --from-url "$TARGET_DATABASE_URL" \
  --to-schema-datamodel /tmp/kamikaze-legacy-c2fa13e-parent.prisma \
  --exit-code
```

Continúe sólo si la salida exacta contiene `No difference detected.` y el código es `0`.

### 2.3 Certificar baseline y aplicar el forward

```bash
DATABASE_URL="$TARGET_DATABASE_URL" npx prisma migrate resolve \
  --applied 20260814000100_baseline_legacy_schema

DATABASE_URL="$TARGET_DATABASE_URL" npx prisma migrate deploy
DATABASE_URL="$TARGET_DATABASE_URL" npx prisma migrate status

DATABASE_URL="$TARGET_DATABASE_URL" npx prisma migrate diff \
  --from-url "$TARGET_DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --exit-code
```

El `resolve` no aplica el baseline: registra que sus tablas ya existían. `migrate deploy` debe aplicar únicamente `20260814000200_add_whatsapp_delivery_lifecycle`.

## 3. Adopción de una base ya actual por `db push`

1. Realice y verifique el backup igual que en la ruta legado.
2. Registre conteos e IDs representativos antes de tocar historia.
3. Demuestre drift cero contra el schema actual:

```bash
cd backend
DATABASE_URL="$TARGET_DATABASE_URL" npx prisma migrate diff \
  --from-url "$TARGET_DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --exit-code
```

Sólo después del resultado exacto `No difference detected.`:

```bash
DATABASE_URL="$TARGET_DATABASE_URL" npx prisma migrate resolve \
  --applied 20260814000100_baseline_legacy_schema

DATABASE_URL="$TARGET_DATABASE_URL" npx prisma migrate resolve \
  --applied 20260814000200_add_whatsapp_delivery_lifecycle

DATABASE_URL="$TARGET_DATABASE_URL" npx prisma migrate status
```

Vuelva a medir conteos/IDs y repita el drift. Ambos `resolve` sólo crean/actualizan `_prisma_migrations`; no deben cambiar tablas empresariales.

## 4. Inspeccionar la historia

Use un cliente PostgreSQL autorizado, sin imprimir la URL:

```sql
SELECT migration_name, started_at, finished_at, rolled_back_at, logs
FROM "_prisma_migrations"
ORDER BY started_at;
```

Cada migración esperada debe tener `finished_at` y no tener `rolled_back_at`. Revise `logs` antes de cualquier recuperación.

## 5. Cómo abortar sin daño

- Antes de `resolve`: cierre la sesión; no hay cambios de historia.
- Drift distinto de cero: guarde la salida sanitizada y deténgase.
- Error en `migrate deploy`: no improvise otro `resolve`, rollback SQL ni reset. Preserve logs y estado para revisión.
- No ejecute `DROP`, `TRUNCATE`, `migrate reset` ni recree la base para forzar un status verde.

Prisma Migrate es forward-oriented. `resolve` ayuda a registrar el resultado de una decisión revisada, pero no revierte tablas. La recuperación de un deploy fallido requiere inspección manual, backup comprobado y, normalmente, una nueva migración correctiva.

## 6. Cambios futuros

1. Modificar `schema.prisma` en una rama.
2. Crear una migración nueva; no editar migraciones ya desplegadas.
3. Revisar todo el SQL y buscar operaciones destructivas.
4. Verificar instalación fresca y upgrade con datos en PostgreSQL descartable.
5. Ejecutar tests, build, lint y `prisma migrate diff --exit-code`.
6. Desplegar con `prisma migrate deploy`; nunca con `db push` en producción.

## Checklist de aprobación humana

- [ ] Backup con checksum y restauración probada.
- [ ] Commit exacto y ventana registrados.
- [ ] Base clasificada correctamente: fresh, legacy o already-current.
- [ ] Drift cero exacto, revisado por dos ojos.
- [ ] Conteos e IDs guardados antes de adopción.
- [ ] Comandos `resolve` coinciden con la ruta elegida.
- [ ] Status y drift final limpios.
- [ ] Conteos, IDs y relaciones sin cambios inesperados.
