const eur = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

/** Format integer cents as EUR for display only. */
export function formatEurCents(cents: number): string {
  return eur.format(cents / 100);
}

export function calcItemsTotal(
  items: ReadonlyArray<{ quantity: number; price: number }>,
): number {
  return items.reduce((sum, item) => sum + item.quantity * item.price, 0);
}
