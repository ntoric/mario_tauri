import type { OrderItem, Item } from '../types';

export function addItem(orderItems: OrderItem[], item: Item): OrderItem[] {
  const existing = orderItems.find(oi => oi.itemId === item.id);
  if (existing) {
    return orderItems.map(oi =>
      oi.itemId === item.id
        ? { ...oi, quantity: oi.quantity + 1 }
        : oi
    );
  }
  return [...orderItems, { itemId: item.id, item, quantity: 1 }];
}

export function updateQuantity(orderItems: OrderItem[], itemId: string, delta: number): OrderItem[] {
  return orderItems.map(oi => {
    if (oi.itemId === itemId) {
      const newQuantity = oi.quantity + delta;
      return newQuantity > 0 ? { ...oi, quantity: newQuantity } : oi;
    }
    return oi;
  }).filter(oi => oi.quantity > 0);
}

export function removeItem(orderItems: OrderItem[], itemId: string): OrderItem[] {
  return orderItems.filter(oi => oi.itemId !== itemId);
}

export function calculateSubtotal(orderItems: OrderItem[]): number {
  return orderItems.reduce((sum, oi) => sum + (oi.item.price * oi.quantity), 0);
}

export function calculateTax(orderItems: OrderItem[]): number {
  return orderItems.reduce((sum, oi) => {
    const taxPercent = oi.item.taxPercent || 0;
    return sum + (oi.item.price * oi.quantity * taxPercent / 100);
  }, 0);
}

export function filterItems(items: Item[], selectedCategory: string, searchQuery: string): Item[] {
  return items.filter(item => {
    const matchesCategory = selectedCategory === 'all' || item.categoryId === selectedCategory;
    const matchesSearch = searchQuery === '' || item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });
}
