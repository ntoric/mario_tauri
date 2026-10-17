import type { OrderItem } from '../types';

/**
 * Returns the price to charge for an order line item: the unit price captured
 * when the item was ordered (so later menu price changes don't alter existing
 * orders), falling back to the item's current price for freshly added cart
 * lines that have no snapshot yet.
 */
export const orderItemUnitPrice = (oi: Pick<OrderItem, 'unitPrice'> & { item?: { price?: number } }): number => {
  return oi.unitPrice ?? oi.item?.price ?? 0;
};
