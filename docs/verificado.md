# Verificado contra la API real

Resultados de las verificaciones de la sección 3 de `SPEC.md`, obtenidos con el flujo «Verificar API» (`.github/workflows/verify.yml`), que es el único sitio desde el que se llega a Blizzard.

Última ejecución: 12 de noviembre de 2026, 11:47 UTC ([ejecución 43212133814](https://github.com/rrandom33/empty-page-deployer/actions/runs/43212133814)), sobre la foto de las 11:25 UTC.

## 3.1 API de Blizzard

| # | Qué | Estado | Resultado |
|---|---|---|---|
| 1 | `houseId` de Alianza y de Blackwater del ruleset PvP | **Pendiente** | Acotado a cuatro candidatas por facción; falta comparar con precios del juego. Ver abajo. |
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

## Supuestos que quedan en el código

- **Casas**: con `houses` vacío en `config/houses.json` se recogen todas las casas de Alianza y Blackwater con anuncios (ocho). Al fijar los dos IDs se rellena `houses` y las demás dejan de guardarse.
- **Foto nueva**: se envía `If-Modified-Since` con el último `Last-Modified` de la primera casa y, por si acaso, se compara una huella de sus anuncios.
- **`time_left`**: solo `SHORT` se trata de forma especial (un anuncio que desaparece con `SHORT` cuenta como caducado).
- **Objeto**: los agregados se agrupan por `item.id`; no se distinguen variantes por `bonus_lists` o `modifiers`.
- **Hora de la foto**: la de `Last-Modified`, en UTC.

## 3.3 Reglas económicas (por verificar en el juego)

- Comisión de venta: 5% facción, 15% Blackwater. Pendiente de una venta real.
- Depósito: 5% / 20% / 60% del precio de vendedor a 2 / 8 / 24 h. Pendiente.
