/** Formatea cobre como `12o 40p 50c`, omitiendo las unidades a cero. */
export function formatCopper(copper: number): string {
  const total = Math.round(Math.abs(copper));
  const parts: string[] = [];
  const gold = Math.floor(total / 10000);
  const silver = Math.floor((total % 10000) / 100);
  const rest = total % 100;
  if (gold) parts.push(`${gold}o`);
  if (silver) parts.push(`${silver}p`);
  if (rest || parts.length === 0) parts.push(`${rest}c`);
  return (copper < 0 ? '-' : '') + parts.join(' ');
}
