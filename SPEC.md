# WoW Subastas — especificación de construcción

Herramienta personal de Andreu para invertir en la casa de subastas de WoW Forever (Europa, ruleset PvP, Alianza). Este documento es la fuente de verdad para construirla. Va en la raíz del repositorio como `SPEC.md`.

Mockups de las cuatro pantallas: https://claude.ai/artifact/WiaQtWXkmNhXPqhnrgEciN

## 0. Prompt de arranque

Pegar esto en una sesión nueva de Claude con el repositorio conectado:

```
Lee SPEC.md entero antes de tocar nada. Construye la fase que te indico al final
siguiendo la especificación al pie de la letra: no cambies la arquitectura, las
fórmulas ni el diseño sin preguntarme. Lo que la especificación marca como
«por verificar» compruébalo primero contra la API real (dentro de GitHub Actions,
porque desde tu entorno no llegas a Blizzard) y anota el resultado en
docs/verificado.md antes de escribir código que dependa de ello. Trabaja en una
rama, abre un pull request por fase y no des una fase por terminada hasta cumplir
sus criterios de aceptación con datos reales. Interfaz y textos en español,
registro sobrio. Fase a construir: FASE 1.
```

Para las fases siguientes se cambia solo la última línea. Modelo recomendado por fase en la sección 9.

## 1. Qué decide la herramienta

Tres preguntas, por este orden de valor:

1. Qué fabricar hoy, con cuánto material y a qué precio venderlo (recetas como negocio).
2. Cuándo comprar cada material (hora y día en que está más barato) y por debajo de qué precio.
3. Qué anuncios aislados están muy por debajo de su precio habitual y se pueden revender.

Todo se ordena por **oro neto ganado por día**, no por margen. La herramienta solo lee y recomienda; nunca actúa dentro del juego.

## 2. Decisiones cerradas

- Un único repositorio **público** en GitHub. Motivo: Actions sin límite de minutos y GitHub Pages gratis. No se publica nada personal: los datos son los públicos de Blizzard, la lista de seguimiento vive en el navegador y el nombre del personaje va como secreto.
- Recolector en GitHub Actions; web estática en GitHub Pages. Sin servidor, sin base de datos externa.
- Solo se guardan las casas de Alianza y de Blackwater. Horda queda fuera.
- TypeScript en todo (recolector con Node 22, web con Vite + React).
- Web pensada para escritorio (pantalla lateral mientras juega, ancho 1280–1440), utilizable en móvil.
- Diseño: Fluent 2 (`@fluentui/react-components` v9) con navy `#0F2B46` como color de marca, igual que el resto de herramientas de Andreu. Las cuatro pantallas siguen los mockups.

## 3. Datos de origen

### 3.1 API de Blizzard (no documentada para Forever; puede cambiar sin aviso)

- Token: `POST https://oauth.battle.net/token`, `grant_type=client_credentials`, autenticación básica con client ID y secret.
- Host: `https://eu.api.blizzard.com`. Namespaces: `dynamic-forever-eu` (subastas), `static-forever-eu` (objetos), `profile-forever-eu` (personaje).
- Rulesets: `GET /data/wow/ruleset/index`. En EU: 1 PvP, 2 Normal, 3 Roleplay, 15 Roleplay PvP.
- Índice de casas: `GET /data/wow/ruleset/{id}/auctions/` (la barra final es obligatoria). Devuelve `{ auctions: [{ key, name, id }] }`. Quince casas, IDs 110–121 y 123–125, cinco por nombre: «Alliance Auction House», «Horde Auction House», «Blackwater Auction House».
- Casa: `GET /data/wow/ruleset/{id}/auctions/{houseId}` → `{ id, name, auctions, commodities, ruleset }`. El campo `auctions` es opcional.
- Materiales: `GET /data/wow/ruleset/{id}/auctions/{houseId}/commodities` → `{ auctions: [{ id, item, quantity, unit_price, time_left }] }`.
- Anuncio normal: `id`, `item { id, context, bonus_lists, modifiers }`, `buyout` (opcional), `bid` (opcional), `quantity`, `time_left`.
- Tamaño: hasta 68.000 anuncios y unos 9 MB por casa. Pedir con `Accept-Encoding: gzip`.
- Frecuencia: Blizzard publica una foto por hora (documentado para retail; varios sitios de precios lo confirman para Forever).
- Límites generales de la API: 36.000 peticiones por hora y 100 por segundo.
- Objetos: `GET /data/wow/item/{id}` en `static-forever-eu`. Falla (404) para cerca del 43% de los IDs antiguos: hay que tener un respaldo de nombres.
- Personaje: `GET /profile/wow/character/{nombre}-{apellido}/professions` en `profile-forever-eu` (slug en minúsculas).

**Por verificar en la primera ejecución** (anotar en `docs/verificado.md`):

1. Qué `houseId` corresponde a la casa de Alianza del ruleset PvP. Hoy todos los rulesets devuelven las mismas quince casas, así que cinco casas con el mismo nombre son, previsiblemente, una por ruleset o agrupación. Método: Andreu anota en el juego el precio mínimo y la cantidad de tres objetos concretos; se compara con cada casa «Alliance» y se fija el ID que coincide. Repetir para Blackwater.
2. Unidad de los precios (se asume cobre: 10.000 = 1 oro).
3. Si las respuestas traen cabecera `Last-Modified` o admiten `If-Modified-Since`. Si no, detectar foto nueva comparando un hash de los primeros anuncios.
4. Valores posibles de `time_left` (se asume `SHORT`, `MEDIUM`, `LONG`, `VERY_LONG`).
5. Si los materiales apilables llegan por `/commodities`, por `auctions` o por ambos.
6. Forma exacta de la respuesta de profesiones del personaje y si incluye recetas conocidas.

### 3.2 Recetas, nombres y precios de vendedor: ForeverDB

- Base `https://foreverdb.net/api/v1`, clave en cabecera `X-API-Key`, `User-Agent` con el nombre de la app (sin él, Cloudflare puede devolver 403).
- Límites: 60 peticiones por minuto y 10.000 al día. Respuestas paginadas (`limit` hasta 100, `offset`).
- `GET /professions/{slug}`: recetas con `reagents`, salida (`count` o `min`/`max`), habilidad y cómo se aprende.
- `GET /items/{id}`: nombre, calidad, precio de venta al vendedor. `GET /vendors/{id}`: precios de compra al vendedor en cobre.
- Condición de uso: enlace visible «Datos de ForeverDB.net» allí donde se muestren sus datos. Ya está en el pie del menú lateral de los mockups.
- La clave requiere aprobación manual. **Respaldo si no llega a tiempo**: cargar a mano en `data/recipes.seed.json` las recetas de peletería que Andreu ya usa (Tienda de campaña = 5 Cuero ligero; Cuero ligero = 3 Restos de cuero estropeado) y ampliar después.
- El catálogo (recetas, objetos, vendedores) se descarga una vez al día, no en cada ejecución, y se guarda en la rama `data`.
- Nombres en español: no documentado. Probar `locale=es_ES` en la API de Blizzard para los nombres; si no hay, mostrar el nombre en inglés.

### 3.3 Reglas económicas del juego

- Comisión de venta: 5% en las casas de facción, 15% en Blackwater (heredado de Classic; **por verificar** en el juego con una venta real).
- Depósito al publicar: porcentaje del precio de vendedor según duración (5% a 2 h, 20% a 8 h, 60% a 24 h según las fuentes; **por verificar**). Mínimo 1 cobre desde el parche del 10 de noviembre de 2026. Se devuelve si se vende y se pierde si caduca o se cancela.
- Todos estos parámetros viven en `config/economy.json`, no en el código.

## 4. Arquitectura

```
.github/workflows/collect.yml   cron cada 10 min + ejecución manual
.github/workflows/catalog.yml   diario: recetas, objetos, vendedores, profesiones del personaje
.github/workflows/pages.yml     despliegue de la web
collector/                      recolector (Node + TypeScript)
engine/                         cálculo puro, compartido por recolector y web, con tests
web/                            Vite + React + Fluent UI v9
config/                         economy.json, houses.json, thresholds.json
docs/verificado.md              resultados de las verificaciones de la sección 3
```

Secretos del repositorio: `BLIZZARD_CLIENT_ID`, `BLIZZARD_CLIENT_SECRET`, `FOREVERDB_API_KEY`, `CHARACTER_SLUG` (nombre-apellido en minúsculas).

### 4.1 Recolector (`collect.yml`)

1. Cada 10 minutos. El cron de GitHub se retrasa a menudo entre 5 y 30 minutos: es aceptable porque la foto es horaria.
2. Pide el token y comprueba si hay foto nueva (verificación 3). Si no la hay, termina en segundos sin escribir nada.
3. Si la hay, descarga las casas configuradas en `config/houses.json`, calcula los agregados por objeto y casa (sección 5) y compara con la foto anterior para estimar ventas.
4. Escribe en la rama `data` y lanza el despliegue de la web.
5. `concurrency` para que no se solapen dos ejecuciones. Reintentos con espera ante 429 o 5xx. Si falla tres veces seguidas, abre un issue.

### 4.2 Rama `data`

Rama huérfana de un solo commit que se reescribe en cada ejecución (`commit --amend` + `push --force`), para que el repositorio no crezca con el historial.

```
state/last_snapshot.json.gz     anuncios de la última foto (id, objeto, precio, cantidad, time_left)
hourly/AAAA-MM-DD.json.gz       agregados por objeto y hora del día (se conservan 30 días)
daily/AAAA-MM.json.gz           agregados por objeto y día (para siempre)
catalog/items.json              id, nombre, calidad, precio de vendedor
catalog/recipes.json            recetas normalizadas
catalog/vendors.json            materiales que vende un vendedor y a qué precio
catalog/character.json          profesiones, nivel y recetas conocidas (sin el nombre del personaje)
meta.json                       hora de la última foto, días de historial, estado de cada fuente
```

### 4.3 Web

- El despliegue de Pages publica la web y, junto a ella, los datos derivados ya calculados: `latest.json` (una fila por objeto con todo lo que muestran las tablas), `today.json` (acciones recomendadas), `recipes.json` (tabla de Fábrica) y un fichero de historial por objeto, `items/{id}.json`, que se carga al abrir la pantalla de Objeto.
- La web no calcula nada pesado. El motor corre en el recolector. La única excepción es el reparto del oro disponible, que se recalcula en el navegador al cambiar la cifra.
- Lista de seguimiento, oro disponible y filtros se guardan en `localStorage`.
- Un despliegue por foto nueva como máximo (unos 24 al día; el límite orientativo de Pages es 10 por hora).

## 5. Motor de cálculo (`engine/`)

Funciones puras con tests. Todos los precios en cobre y por unidad.

### 5.1 Agregados por objeto, casa y foto

- `min`: precio mínimo con compra directa. Los anuncios solo con puja se ignoran.
- `qty`: unidades totales. `listings`: número de anuncios.
- `market`: precio medio ponderado del 15% más barato de las unidades, descartando anuncios por encima de 1,5 veces el anterior en la escalera de precios. Es el «precio de mercado» robusto frente a anuncios aislados.
- `depth`: unidades acumuladas hasta 5 escalones de precio (mínimo, +5%, +20%, +35%, +50%), para la pantalla de Objeto y para calcular el coste real de comprar N unidades.
- `next_gap`: precio del primer anuncio por encima del más barato dividido entre `min`.

### 5.2 Ventas estimadas

Comparando dos fotos consecutivas por `id` de anuncio:

- Anuncio que desaparece con `time_left` distinto de `SHORT` en la foto anterior → vendido (o cancelado).
- Anuncio que desaparece con `SHORT` → caducado; no cuenta.
- Anuncio que sigue con menos cantidad → la diferencia cuenta como vendida.
- `sold_per_day`: media de los últimos 3 días. Las cancelaciones inflan la cifra: se aplica un factor de prudencia configurable (por defecto 0,7) y se muestra siempre con «~».

### 5.3 Referencia y fiabilidad

- `ref`: mediana de `market` de las últimas 72 horas. No se usa el histórico completo porque los precios caen de forma natural en las primeras semanas del juego.
- `stability`: desviación absoluta mediana dividida entre la mediana, sobre esas 72 horas.
- `trend`: pendiente de la mediana diaria de los últimos 7 días, en porcentaje por día.
- Fiabilidad: Alta (≥ 72 h de datos, `stability` ≤ 0,15, `sold_per_day` ≥ 20), Media, Baja. Con menos de 48 h de datos no se genera ninguna señal.

### 5.4 Ganga (comprar para revender)

Un objeto es ganga cuando se cumplen las cuatro condiciones (umbrales en `config/thresholds.json`):

1. Descuento: `min` ≤ `ref` × 0,6.
2. Estabilidad: fiabilidad Alta o Media.
3. Aislamiento: tras comprar las unidades baratas, el siguiente precio es ≥ `ref` × 0,85. Si todo el mercado ha bajado, no es ganga.
4. Salida: `sold_per_day` ≥ 5.

Unidades a comprar: las que están por debajo de `ref` × 0,7, con tope del 25% de `sold_per_day`.
Beneficio = unidades × (`ref` × (1 − comisión) − coste medio de compra) − depósito esperado.

### 5.5 Receta

- Coste de cada material = el menor entre: comprarlo en subasta (coste medio real de las N unidades según `depth`), comprarlo al vendedor si lo vende, o fabricarlo con otra receta conocida (recursivo, máximo 3 niveles).
- Precio de venta = `market` del objeto fabricado, no `min`: se asume publicar justo por debajo del mercado.
- Beneficio por unidad = venta × (1 − comisión) − coste de materiales − depósito × probabilidad de no vender.
- Probabilidad de no vender en 24 h = max(0, 1 − `sold_per_day` / (`qty` + unidades propias)).
- Unidades recomendadas = min(25% de `sold_per_day`, lo que permite el oro disponible, lo que permite la profundidad del material sin subir su coste más de un 10%).
- Oro al día = beneficio por unidad × unidades recomendadas ÷ max(1, días estimados para venderlas).
- «Compra el material por debajo de X»: precio del material con el que la receta deja un 40% de margen.
- «Deja de fabricar si baja de Y»: precio de venta con el que el beneficio es cero.
- Las recetas que el personaje no conoce se calculan igual y se muestran aparte, con cómo se aprenden.

### 5.6 Cuándo comprar un material

Con 7 días de datos o más: mediana de `market` por franja (día de la semana × hora), normalizada sobre la mediana semanal. La pantalla de Objeto lo pinta como mapa de calor. Señal «Comprar» en la lista cuando el precio actual está en el cuartil más barato de los últimos 7 días y `trend` no es inferior a −5% por día (si el precio se está desplomando, la señal es «Esperar»).

### 5.7 Pantalla Hoy

Une gangas, recetas y compras de material en una sola lista ordenada por oro al día. Reparte el oro disponible de mayor a menor rendimiento sin superar las unidades recomendadas de cada acción. Máximo 5 acciones visibles. Por defecto solo recetas conocidas y objetos con 20 ventas al día o más.

### 5.8 Blackwater

Para cada objeto, comparar Alianza con Blackwater en los dos sentidos con la comisión del 15% donde corresponda. Se muestra como columna en Mercado y solo entra en Hoy si el beneficio supera al de la mejor acción dentro de la propia facción.

## 6. Pantallas

Siguen los mockups. Las cifras de los mockups son de ejemplo.

1. **Hoy**: oro disponible editable, cuatro cifras de resumen, tabla de acciones recomendadas y lista de seguimiento con señal Comprar / Esperar / Vender.
2. **Fábrica**: filtro por profesión y por recetas conocidas, tabla de recetas ordenable y panel de detalle con rutas de material, precios límite y cuántas fabricar.
3. **Objeto**: precio actual, referencia, precio de compra, ventas; gráfico de precio con mediana móvil y línea del precio de compra; mapa de calor de mejor momento; unidades por tramo de precio.
4. **Mercado**: todos los objetos con buscador, categorías, estrella para seguir, diferencia frente a la mediana, mini gráfico de 7 días y precio en Blackwater.

Reglas de interfaz:

- Precios en formato `12o 40p 50c`, omitiendo las unidades a cero.
- Toda cifra estimada lleva «~». Toda señal muestra su fiabilidad.
- Pie del menú: facción y ruleset, antigüedad de la última foto, días de historial y crédito a ForeverDB.
- Sin datos suficientes, la pantalla lo dice («Faltan 31 horas de datos para dar señales») en lugar de mostrar ceros.
- Colores de señal: azul para comprar, naranja para vender o ganga, gris para esperar. Nunca solo color: siempre con texto.
- Textos sobrios, sin exclamaciones ni frases de efecto.

## 7. Fases y criterios de aceptación

### Fase 1 — Recolector (urgente: cada día sin guardar es historial perdido)

- Las seis verificaciones de 3.1 resueltas y anotadas.
- `collect.yml` corre solo, detecta foto nueva y escribe agregados horarios en la rama `data`.
- Tras 24 horas: al menos 20 fotos guardadas, sin ejecuciones fallidas consecutivas, repositorio por debajo de 200 MB.
- Tres precios elegidos por Andreu coinciden con los del juego en el momento de la foto.

### Fase 2 — Mercado y Objeto

- Web desplegada en Pages con Mercado (búsqueda, estrella, orden) y Objeto (gráfico, profundidad).
- Catálogo de nombres cargado; los objetos sin nombre muestran su ID y no rompen la tabla.
- Carga inicial por debajo de 2 segundos en escritorio; `latest.json` por debajo de 1,5 MB comprimido.

### Fase 3 — Fábrica

- Recetas de las profesiones de Andreu cargadas y marcadas como conocidas o no.
- El cálculo de la Tienda de campaña hecho a mano por Andreu con los precios del juego coincide con la pantalla (diferencia menor del 2%).
- Tests del motor para: ruta de material más barata, comisión, depósito, unidades recomendadas.

### Fase 4 — Hoy, gangas y momento de compra

- Requiere 7 días de historial.
- Lista de acciones con reparto de oro; señales en la lista de seguimiento; mapa de calor en Objeto.
- Revisión de umbrales con Andreu tras una semana de uso: registrar qué recomendaciones siguió y cuánto ganó de verdad, y ajustar `thresholds.json`.

### Más adelante (no construir sin pedirlo)

- Avisos al móvil cuando un objeto de la lista cruza su precio de compra.
- Registro de operaciones reales para medir el rendimiento frente a lo estimado.
- Exportar los precios de referencia a un addon para ver las gangas dentro del juego.

## 8. Riesgos conocidos

- La API de Forever no está documentada: rutas y formas pueden cambiar. El recolector valida la forma de cada respuesta y falla con un mensaje claro en vez de guardar datos corruptos.
- El ID de ruleset no filtra hoy; si Blizzard lo corrige, cambiarán las casas. `config/houses.json` aísla ese cambio.
- Las ventas son estimadas. Ninguna recomendación debe presentarse como segura.
- La foto es horaria: los anuncios que duran minutos no se ven. La herramienta sirve para saber qué vale cada cosa y para oportunidades que duran.
- El mercado es joven y los precios caen: por eso la referencia es de 72 horas y hay filtro de tendencia.
- Las raids abren el 9 de diciembre de 2026: es previsible una subida de consumibles y de sus materiales. Conviene tener la Fase 4 antes.
- GitHub desactiva los flujos programados de un repositorio público tras 60 días sin actividad. Los despliegues y cambios de código la mantienen; si se desactiva, basta reactivarlo en la pestaña Actions.
- Ya existen sitios públicos con precios e historial de Forever (Blackwater Exchange, BootyBayBroker, AzerothVault). Sirven para contrastar cifras durante la Fase 1 y como referencia mientras se acumula historial propio. Lo que no dan es el plan a medida: tus recetas, tu oro, tu lista y el momento de compra.

## 9. Modelo recomendado por fase

- Fase 1: modelo intermedio. Es fontanería, pero hay verificación contra una API sin documentar.
- Fase 2: modelo económico. Tablas y gráficos sobre datos ya definidos.
- Fase 3: modelo intermedio para el motor y sus tests; económico para la pantalla.
- Fase 4: modelo intermedio, y una revisión final de fórmulas y umbrales con el modelo más capaz.

## Fuentes

- Hilo del foro de Blizzard sobre la API de Forever: https://us.forums.blizzard.com/en/blizzard/t/wow-forever-api-what-works-so-far-plus-a-ts-client/60334
- API de datos de juego de Blizzard: https://community.developer.battle.net/documentation/world-of-warcraft/game-data-apis
- ForeverDB, documentación de la API: https://foreverdb.net/developers
- Parche del 10 de noviembre de 2026 (depósito mínimo): https://news.blizzard.com/en-us/article/24315281/wow-forever-hotfixes-november-10-2026
- Comisiones y depósito: https://warcraftforever.games/guides/auction-house
