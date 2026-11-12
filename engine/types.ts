/** Anuncio normalizado. Precios en cobre y por unidad. */
export interface Listing {
  /** Identificador del anuncio en la API. */
  id: number;
  item: number;
  /** Precio de compra directa por unidad; 0 si el anuncio solo admite puja. */
  unit: number;
  qty: number;
  timeLeft: string;
}

/** Agregados de un objeto en una casa y una foto (sección 5.1). */
export interface ItemAggregate {
  min: number;
  qty: number;
  listings: number;
  market: number;
  /** Unidades acumuladas hasta cada escalón de `depthSteps`. */
  depth: number[];
  /** Primer precio por encima del mínimo dividido entre el mínimo; null si no hay. */
  nextGap: number | null;
}

export interface AggregateOptions {
  cheapestShare: number;
  ladderBreak: number;
  depthSteps: number[];
}

export const DEFAULT_AGGREGATE_OPTIONS: AggregateOptions = {
  cheapestShare: 0.15,
  ladderBreak: 1.5,
  depthSteps: [1, 1.05, 1.2, 1.35, 1.5],
};
