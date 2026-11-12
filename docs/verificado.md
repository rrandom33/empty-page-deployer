# Verificado contra la API real

Resultados de las verificaciones de la sección 3 de `SPEC.md`. Se rellenan con la salida del flujo «Verificar API» (`.github/workflows/verify.yml`), que es el único sitio desde el que se llega a Blizzard.

Estado a 12 de noviembre de 2026: **ninguna verificación hecha todavía**. El flujo necesita los secretos `BLIZZARD_CLIENT_ID` y `BLIZZARD_CLIENT_SECRET` (y `CHARACTER_SLUG` para la 6).

## 3.1 API de Blizzard

| # | Qué | Estado | Resultado |
|---|---|---|---|
| 1 | `houseId` de la casa de Alianza y de Blackwater del ruleset PvP | Pendiente | Requiere además tres precios anotados por Andreu en el juego. |
| 2 | Unidad de los precios (se asume cobre) | Pendiente | |
| 3 | `Last-Modified` / `If-Modified-Since` | Pendiente | |
| 4 | Valores de `time_left` | Pendiente | |
| 5 | Materiales por `/commodities`, por `auctions` o por ambos | Pendiente | |
| 6 | Forma de la respuesta de profesiones del personaje | Pendiente | |

## Supuestos del código mientras no se verifique

El recolector está escrito para funcionar con cualquiera de las respuestas posibles; estos son los supuestos que quedan y qué pasa si no se cumplen.

- **Casas (1)**: con `houses` vacío en `config/houses.json`, se recogen todas las casas llamadas «Alliance Auction House» y «Blackwater Auction House» (diez, previsiblemente), para no perder historial. Al fijar los dos IDs se rellena `houses` y las demás dejan de guardarse.
- **Precio por unidad en anuncios normales**: se asume que `buyout` es el precio de la pila completa y se divide entre `quantity` (como en Classic). En materiales se usa `unit_price`. El flujo de verificación imprime ejemplos de ambos para confirmarlo. Si `buyout` fuera ya por unidad, los precios de objetos apilados vendidos como anuncio normal saldrían bajos.
- **Foto nueva (3)**: se envía `If-Modified-Since` con el último `Last-Modified` y, además, se compara una huella de los anuncios de la primera casa. Funciona tanto si el servidor respeta la cabecera como si no.
- **`time_left` (4)**: solo se trata de forma especial el valor `SHORT` (un anuncio que desaparece con `SHORT` cuenta como caducado). Cualquier otro valor se guarda tal cual.
- **Materiales (5)**: se leen `auctions` de la casa y el subrecurso `/commodities`, y se unen sin duplicar por `id` de anuncio.
- **Objeto**: los agregados se agrupan por `item.id`; no se distinguen variantes por `bonus_lists` o `modifiers`.
- **Hora de la foto**: la de `Last-Modified` si existe; si no, la hora de descarga. Siempre en UTC.

## 3.3 Reglas económicas (por verificar en el juego)

- Comisión de venta: 5% facción, 15% Blackwater. Pendiente de una venta real.
- Depósito: 5% / 20% / 60% del precio de vendedor a 2 / 8 / 24 h. Pendiente.
