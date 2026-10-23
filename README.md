# test-manager-library-3239137-tool

Sembrador de datos de demostración de **Manager Library**: deja la base con
catálogo, socios y préstamos suficientes para una demostración real.

## Qué siembra

| Qué | Cuánto |
|---|---|
| Libros | 40, repartidos entre las cinco categorías, con 1 a 4 ejemplares |
| Socios | 10 |
| Préstamos | 15, de los cuales **3 nacen vencidos** |

## Cómo se corre

Con `infra` levantado y la API respondiendo:

```bash
API_URL=http://localhost:8000/api/v1 \
ADMIN_USERNAME=admin \
ADMIN_PASSWORD=la-clave-del-env \
npm run seed
```

No tiene dependencias: usa el `fetch` de Node 18 o superior.

La prueba local del sembrador se ejecuta con `npm test`. Usa una API simulada y
comprueba que dos ejecuciones no dupliquen los 15 préstamos; no escribe en la
API ni en la base de datos reales.

## Habla por la API, nunca por SQL

Lo exige el spec (data-model §9) y tiene sentido: así los datos de demostración
pasan por las mismas reglas que los de verdad. Si el sembrador tuviera que
escribir SQL para que algo encajara, lo que estaría mal es la API.

Los conflictos 409 de libro o socio repetido se ignoran. El sembrador guarda en
`.seed-state.json` los identificadores de los préstamos creados para no volver a
registrarlos al ejecutarlo otra vez contra la misma API. Ese archivo es local,
está excluido de Git y se puede borrar si se quiere empezar una demostración
nueva; en ese caso conviene usar una base recién creada para evitar duplicar
préstamos.

## Los 3 vencidos y el desvío de reloj

Para que una línea esté vencida, su `due_at` tiene que estar en el pasado, y el
dominio lo calcula como `loaned_at + 14 días`. Por la API no hay forma de pedir
un préstamo con fecha vieja, y escribir SQL está prohibido.

La salida es la que el propio spec ya propone: **el reloj es un puerto** (D-05),
así que se cambia el reloj. El sembrador manda la cabecera
`X-Library-Clock-Offset-Days: -20` en esos tres préstamos, y la API solo la
atiende si corre con `DEMO_CLOCK=true` y `APP_ENV=local`.

Sin esas dos variables la cabecera se ignora sin más: los préstamos se registran
con la fecha de hoy y el script avisa de que salieron menos vencidos de los
esperados. Es un asiento para la demostración, acotado a propósito, y no existe
fuera de local.

## Evidencia (T-21)

Después de correrlo:

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/loans/overdue
# items: 3 líneas

curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/reports/most-borrowed?from=2026-10-01&to=2026-10-31"
# rows: con filas
```
