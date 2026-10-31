import { useAuthStore, useDataStore } from '../stores';
import { isTaxEnabled } from '../utils/tax';

/** True when the current store has tax switched on. All GST menus, fields
 * and options are hidden when it is off. */
export const useTaxEnabled = (): boolean => {
  const { stores } = useDataStore();
  const { currentStoreId } = useAuthStore();
  return isTaxEnabled(stores.find(s => s.id === currentStoreId));
};
