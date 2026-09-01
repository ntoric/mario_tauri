import { useAuthStore, useDataStore } from '../stores';

export interface TaxSettings {
  taxEnabled: boolean;
  defaultTaxPercent: number;
}

export function useTaxSettings(): TaxSettings {
  const { currentStoreId } = useAuthStore();
  const { stores } = useDataStore();
  const currentStore = stores.find(s => s.id === currentStoreId);

  return {
    taxEnabled: currentStore?.taxEnabled ?? true,
    defaultTaxPercent: currentStore?.defaultTaxPercent ?? 0,
  };
}
