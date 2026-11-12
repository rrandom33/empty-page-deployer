# Verificado contra la API real

Resultados de las verificaciones de la sección 3 de `SPEC.md`, obtenidos con el flujo «Verificar API» (`.github/workflows/verify.yml`), que es el único sitio desde el que se llega a Blizzard.

Última ejecución: 12 de noviembre de 2026, 11:47 UTC ([ejecución 43212133814](https://github.com/rrandom33/empty-page-deployer/actions/runs/43212133814)), sobre la foto de las 11:25 UTC.

## 3.1 API de Blizzard

| # | Qué | Estado | Resultado |
|---|---|---|---|
| 1 | `houseId` de Alianza y de Blackwater del ruleset PvP | **Alianza verificada; Blackwater pendiente** | Alianza = **110**. Blackwater sin comprobar (candidatas 116, 117, 121 y 125). Ver abajo. |
| 2 | Unidad de los precios | Verificado | Cobre. Cuero ligero a 45, Paño de lino a 26: solo tiene sentido como cobre. Falta el contraste final con un precio del juego (se hará con la verificación 1). |
| 3 | `Last-Modified` / `If-Modified-Since` | Verificado | La casa y `/commodities` traen `Last-Modified`. Repetir la petición con `If-Modified-Since` devuelve 304. No hay `ETag`. |
| 4 | Valores de `time_left` | Verificado | `SHORT`, `MEDIUM`, `LONG`, `VERY_LONG`, sin otros. |
| 5 | Por dónde llegan los materiales | Verificado | Solo por `/commodities`. En la casa, `commodities` es un enlace (`{ href }`), no una lista. Ningún objeto apilable de prueba aparece en `auctions`. |
| 6 | Profesiones del personaje | **Pendiente** | Falta el secreto `CHARACTER_SLUG`. |

### Otros hallazgos

- **El ruleset no filtra**: los rulesets 1, 2, 3 y 15 devuelven el mismo índice de quince casas.
- **`buyout` es por unidad**: todos los anuncios normales tienen `quantity` 1 (0 de 109.630 en la casa 110 con cantidad mayor), así que dividir `buyout` entre `quantity` no cambia nada.
- **Nombres**: sin `locale`, los nombres llegan como objeto con todos los idiomas; el recolector pide siempre un idioma. Con `locale=es_ES` la API de objetos devuelve nombres en español («Cuero ligero», «Restos de cuero estropeado», «Paño de lino», «Cuero medio», «Cuero pesado»).
- **Tamaño**: las casas grandes superan lo previsto en la especificación (68.000 anuncios): la 110 tiene 188.773 y la 111, 196.115.
- **Casas vacías**: la 112 (Alianza) y la 118 (Blackwater) existen pero no tienen ningún anuncio.
- Las casas no comparten ningún anuncio entre sí: son mercados distintos.

### Verificación 1: candidatas

**Alianza = 110.** Captura del juego de Andreu el 12 de noviembre hacia las 14:00 (hora de Madrid): Cuero ligero con 7.355 unidades desde 55c y el grueso entre 66c y 80c. La 110 tenía 7.694 unidades a las 12:25 y 4.274 desde 76c a las 13:25; las otras candidatas tenían 14.503, 1.437 y 2.181. Coincide en volumen y en rango de precio, no al céntimo, porque la captura es posterior a la foto. Confirmado por Andreu.

Por numeración, las casas parecen ir en grupos de Alianza / Horda / Blackwater: 110-113-116, 111-114-117, 112-115-118 (vacío), 119-120-121 y 123-124-125. Cuatro grupos con datos para cuatro rulesets. Es una hipótesis: qué grupo es el PvP solo se sabe comparando con el juego.

Precio mínimo y unidades en la foto de las 11:25 UTC del 12 de noviembre:

| Casa | Anuncios | Cuero ligero (2318) | Restos de cuero (2934) | Paño de lino (2589) | Cuero medio (2319) | Cuero pesado (4234) |
|---|---|---|---|---|---|---|
| 110 Alianza | 188.773 | 45c · 7.694 | 13c · 5.523 | 26c · 15.812 | 1p · 5.674 | 2p 9c · 4.583 |
| 111 Alianza | 196.115 | 30c · 14.323 | 11c · 4.428 | 15c · 19.314 | 89c · 5.333 | 2p 33c · 4.175 |
| 119 Alianza | 29.525 | 39c · 1.471 | 13c · 2.243 | 27c · 5.064 | 1p 8c · 2.123 | 2p 90c · 290 |
| 123 Alianza | 23.351 | 40c · 2.248 | 10c · 1.002 | 25c · 489 | 75c · 1.846 | 3p 48c · 481 |
| 116 Blackwater | 20.227 | 89c · 477 | 29c · 82 | 90c · 2.576 | 2p 8c · 4.051 | 1p 77c · 2.401 |
| 117 Blackwater | 17.910 | 1p 50c · 1.173 | 2p · 273 | 30c · 485 | 92c · 761 | 2p 33c · 4.756 |
| 121 Blackwater | 628 | 44c · 118 | 35c · 107 | 26c · 526 | 1p 50c · 84 | 3p 70c · 29 |
| 125 Blackwater | 740 | 99c · 19 | 98c · 9 | 24c · 296 | 3p 50c · 120 | 7p 25c · 221 |

## Catálogo: profesiones, recetas y objetos

Sondeado el 12 de noviembre de 2026 en `static-forever-eu`. La API de Blizzard da todo el catálogo, así que **no hace falta ForeverDB** ni el fichero de recetas cargado a mano de la sección 3.2.

- `GET /data/wow/profession/index` → profesiones (Peletería es la 165).
- `GET /data/wow/profession/{id}` → `skill_tiers`; `GET /data/wow/profession/{id}/skill-tier/{tier}` → `categories[].recipes[]`. El nivel máximo de peletería es hoy 75.
- `GET /data/wow/recipe/{id}` → `crafted_item`, `reagents[{ reagent, quantity }]` y `crafted_quantity { value }`. **No trae el nivel de habilidad que pide la receta ni cómo se aprende.** `/data/wow/recipe/index` y la búsqueda de recetas devuelven 404.
- `GET /data/wow/search/item?orderby=id&_pageSize=1000&id=[desde,hasta]` → hasta 1.000 objetos por petición con nombre en todos los idiomas, calidad, clase, subclase, `sell_price` y `purchase_price`. Con esto se descarga el catálogo entero en pocas peticiones, sin el problema de los 404 de `/data/wow/item/{id}`.
- La Tienda de campaña es el objeto 279978 («Tienda de campamento»).
- La API no dice qué objetos vende un vendedor: `purchase_price` existe para todos. Los materiales de vendedor salen de `Data/NPCs.lua` del addon de ForeverDB (público, mismo crédito): vendedores con su bando, si se han visto en Forever y lo que venden con precio, unidades por compra y existencias limitadas. Se descartan los de la Horda y los de existencias limitadas, y se prefieren los vistos en Forever. Los vendedores no vistos en Forever son datos de Classic. **Por verificar**: el precio de ForeverDB es el de una compra de `stack` unidades y se divide entre ellas (Vial vacío: 20c por 5 = 4c cada uno); Blizzard da 20c como `purchase_price`. Afecta solo a lo que se vende en lotes, como viales y especias.

- **Nivel de cada receta**: no lo da Blizzard. Sale del fichero público de datos del addon de ForeverDB (`https://foreverdb.net/downloads/addon-manifest.json` → `Data/Recipes.lua`), que no necesita clave. Licencia GPL-3.0 con crédito obligatorio, que el pie del menú muestra («Datos de ForeverDB.net»). Verificado el 12 de noviembre de 2026 con los datos `2026-11-11.5fe262fd`: 2.302 objetos fabricables con nivel, y las 2.311 recetas del catálogo de Blizzard quedan cubiertas. Cada receta trae el nivel de aprendizaje, los niveles amarillo, verde y gris, cómo se aprende y si es nueva en Forever. Cuando el nivel de aprendizaje viene a 0 (desconocido; es el caso de la Tienda de campamento) se usa el nivel en que pasa a amarilla y se muestra como «≤».

Consecuencias para la herramienta:

- Qué recetas conoce el personaje solo puede salir del perfil (`CHARACTER_SLUG`, verificación 6). Mientras falte, las recetas conocidas se marcan a mano en Fábrica y se guardan en el navegador.
- El pie del menú acredita la API de Blizzard en lugar de ForeverDB, porque no se muestran datos de ForeverDB.

## Otras fuentes revisadas

- **Timesaver.gg** publica un CSV con la mediana de 40 materiales por región y facción. Sale de la misma API de Blizzard y mezcla todas las casas, así que no añade nada a lo que ya se recoge.
- **Addons de precios** (AzerothCharts, Hammerprice, auxForever…) guardan historial dentro del juego; no publican sus datos.
- No se ha encontrado ninguna fuente de historial de precios de Forever anterior al 12 de noviembre de 2026 que se pueda descargar.

## Supuestos que quedan en el código

- **Casas**: Alianza está fijada en la 110. De Blackwater se recogen las cuatro candidatas con anuncios hasta fijar su ID en `config/houses.json`.
- **Foto nueva**: se envía `If-Modified-Since` con el último `Last-Modified` de la primera casa y, por si acaso, se compara una huella de sus anuncios.
- **`time_left`**: solo `SHORT` se trata de forma especial (un anuncio que desaparece con `SHORT` cuenta como caducado).
- **Fiabilidad Media**: la especificación solo define la Alta. Media = al menos 48 h de datos, `stability` ≤ 0,30 y 5 ventas al día o más (`config/thresholds.json`).
- **Señal «Vender»**: la especificación no da su fórmula. Se usa la simétrica de «Comprar»: precio actual en el cuartil más caro de los últimos 7 días.
- **Ganga**: si tras las unidades baratas no queda ningún anuncio más caro que confirme la referencia, no se considera ganga.
- **Ventas al día**: hacen falta al menos 6 horas con ventas estimadas para dar la cifra.
- **Blackwater**: la columna de Mercado queda vacía y la comparación de la sección 5.8 no se calcula hasta fijar su casa.
- **Objeto**: los agregados se agrupan por `item.id`; no se distinguen variantes por `bonus_lists` o `modifiers`.
- **Hora de la foto**: la de `Last-Modified`, en UTC.

## 3.3 Reglas económicas (por verificar en el juego)

- Comisión de venta: 5% facción, 15% Blackwater. Pendiente de una venta real.
- Depósito: 5% / 20% / 60% del precio de vendedor a 2 / 8 / 24 h. Pendiente.
