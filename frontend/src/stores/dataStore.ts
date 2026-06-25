import { create } from 'zustand';
import { api } from '../services/api';
import { useAuthStore } from './authStore';
import { cache, cacheKeys } from '../utils/cache';
import type { Category, Item, Table, Order, Bill, Store, BillQueueItem, ExpenseCategory, Expense } from '../types';

interface DataState {
  // Data
  stores: Store[];
  categories: Category[];
  items: Item[];
  tables: Table[];
  orders: Order[];
  bills: Bill[];
  billQueue: BillQueueItem[];
  users: any[];
  expenseCategories: ExpenseCategory[];
  expenses: Expense[];
  
  // Loading states
  isLoading: boolean;
  isInitialized: boolean;
  
  // Actions
  initialize: () => Promise<void>;
  refreshData: (force?: boolean) => Promise<void>;
  clearCache: () => void;
  
  // Store management
  fetchStores: () => Promise<void>;
  createStore: (store: Partial<Store>) => Promise<Store>;
  updateStore: (id: string, store: Partial<Store>) => Promise<void>;
  deleteStore: (id: string) => Promise<void>;
  switchStore: (storeId: string) => Promise<void>;
  
  // Categories
  fetchCategories: () => Promise<void>;
  createCategory: (category: Omit<Category, 'id' | 'storeId' | 'isActive'> & Partial<Pick<Category, 'isActive'>>) => Promise<void>;
  updateCategory: (id: string, category: Partial<Category>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  
  // Items
  fetchItems: () => Promise<void>;
  createItem: (item: Omit<Item, 'id' | 'storeId' | 'isActive'> & Partial<Pick<Item, 'isActive'>>) => Promise<void>;
  updateItem: (id: string, item: Partial<Item>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  
  // Tables
  fetchTables: () => Promise<void>;
  createTable: (table: Omit<Table, 'id' | 'storeId' | 'isActive'> & Partial<Pick<Table, 'isActive'>>) => Promise<void>;
  updateTable: (id: string, table: Partial<Table>) => Promise<void>;
  deleteTable: (id: string) => Promise<void>;
  
  // Orders
  fetchOrders: () => Promise<void>;
  createOrder: (order: Omit<Order, 'id' | 'storeId' | 'status' | 'createdAt' | 'updatedAt' | 'createdBy'> & Partial<Pick<Order, 'status' | 'createdBy'>>) => Promise<Order>;
  saveEBill: (order: Omit<Order, 'id' | 'storeId' | 'status' | 'createdAt' | 'updatedAt' | 'createdBy'> & Partial<Pick<Order, 'status' | 'createdBy'>>) => Promise<Order>;
  savePrint: (orderId: string, bill: Omit<Bill, 'id' | 'storeId' | 'items' | 'isPrinted' | 'generatedAt' | 'generatedBy'> & Partial<Pick<Bill, 'items' | 'isPrinted' | 'generatedAt' | 'generatedBy'>>) => Promise<void>;
  updateOrder: (id: string, order: Partial<Order>) => Promise<void>;
  completeOrder: (id: string, paymentMethod?: string) => Promise<void>;
  cancelOrder: (id: string) => Promise<void>;
  getActiveOrderByTable: (tableId: string) => Order | undefined;
  
  // Bills
  fetchBills: (bypassCache?: boolean) => Promise<void>;
  createBill: (bill: Omit<Bill, 'id' | 'storeId' | 'items' | 'isPrinted' | 'generatedAt' | 'generatedBy'> & Partial<Pick<Bill, 'items' | 'isPrinted' | 'generatedAt' | 'generatedBy'>>) => Promise<void>;
  enqueueBill: (bill: Omit<Bill, 'id' | 'storeId' | 'items' | 'isPrinted' | 'generatedAt' | 'generatedBy'> & Partial<Pick<Bill, 'items' | 'isPrinted' | 'generatedAt' | 'generatedBy'>>) => Promise<void>;
  getNextInvoiceNo: () => Promise<string>;
  fetchBillQueue: () => Promise<void>;
  
  // Users
  fetchUsers: () => Promise<void>;
  createUser: (user: any) => Promise<void>;
  updateUser: (id: string, user: any) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  resetPassword: (userId: string, password: string) => Promise<void>;

  // Expense Categories
  fetchExpenseCategories: () => Promise<void>;
  createExpenseCategory: (category: Omit<ExpenseCategory, 'id' | 'storeId' | 'isActive' | 'createdAt'>) => Promise<void>;
  updateExpenseCategory: (id: string, category: Partial<ExpenseCategory>) => Promise<void>;
  deleteExpenseCategory: (id: string) => Promise<void>;

  // Expenses
  fetchExpenses: (startDate?: string, endDate?: string) => Promise<void>;
  createExpense: (expense: Omit<Expense, 'id' | 'storeId' | 'isActive' | 'createdAt' | 'updatedAt' | 'createdBy'>) => Promise<void>;
  updateExpense: (id: string, expense: Partial<Expense>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
}

export const useDataStore = create<DataState>((set, get) => ({
  stores: [],
  categories: [],
  items: [],
  tables: [],
  orders: [],
  bills: [],
  billQueue: [],
  users: [],
  expenseCategories: [],
  expenses: [],
  isLoading: false,
  isInitialized: false,

  initialize: async () => {
    if (get().isInitialized) return;
    
    // Clear cache on app startup
    cache.clear();
    
    await get().refreshData();
    set({ isInitialized: true });
  },

  refreshData: async (force = false) => {
    // Clear cache if force refresh
    if (force) {
      cache.clear();
    }

    // Always fetch stores first (needed to determine current store for business_admin/staff)
    await get().fetchStores();
    
    // Ensure store is selected after fetching stores
    const authStore = useAuthStore.getState();
    authStore.ensureStoreSelected();
    
    const currentStoreId = authStore.currentStoreId;
    
    // If still no store selected, skip fetching store-specific data
    if (!currentStoreId) {
      console.warn('[DataStore] No store selected, skipping store-specific data fetch');
      return;
    }

    set({ isLoading: true });
    try {
      await Promise.all([
        get().fetchCategories(),
        get().fetchItems(),
        get().fetchTables(),
        get().fetchOrders(),
        get().fetchBills(),
        get().fetchUsers(),
      ]);
    } finally {
      set({ isLoading: false });
    }
  },

  clearCache: () => {
    cache.clear();
    console.log('[DataStore] Cache cleared manually');
  },

  // Store management
  fetchStores: async () => {
    try {
      const cacheKey = cacheKeys.stores();
      
      // Try cache first
      const cached = cache.get<Store[]>(cacheKey);
      if (cached) {
        set({ stores: cached });
        return;
      }
      
      const stores = await api.getStores();
      cache.set(cacheKey, stores);
      set({ stores });
    } catch (error) {
      console.error('Failed to fetch stores:', error);
    }
  },

  createStore: async (store) => {
    const newStore = await api.createStore(store);
    cache.delete(cacheKeys.stores());
    await get().fetchStores();
    return newStore;
  },

  updateStore: async (id, store) => {
    await api.updateStore(id, store);
    cache.delete(cacheKeys.stores());
    await get().fetchStores();
  },

  deleteStore: async (id) => {
    await api.deleteStore(id);
    cache.delete(cacheKeys.stores());
    await get().fetchStores();
  },

  switchStore: async (storeId) => {
    await api.switchStore(storeId);
    useAuthStore.getState().setCurrentStore(storeId);
    
    // Clear store-specific cache when switching stores
    cache.deleteByPrefix('categories:');
    cache.deleteByPrefix('items:');
    cache.deleteByPrefix('orders:');
    cache.deleteByPrefix('bills:');
    
    await get().refreshData();
  },

  // Categories
  fetchCategories: async () => {
    const currentStoreId = useAuthStore.getState().currentStoreId;
    if (!currentStoreId) return;
    try {
      const cacheKey = cacheKeys.categories(currentStoreId);
      
      // Try cache first
      const cached = cache.get<Category[]>(cacheKey);
      if (cached) {
        set({ categories: cached });
        return;
      }
      
      const categories = await api.getCategories(currentStoreId);
      cache.set(cacheKey, categories);
      set({ categories });
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  },

  createCategory: async (category) => {
    const currentStoreId = useAuthStore.getState().currentStoreId;
    if (!currentStoreId) {
      throw new Error('Store not selected');
    }
    await api.createCategory({ ...category, storeId: currentStoreId });
    cache.delete(cacheKeys.categories(currentStoreId));
    await get().fetchCategories();
  },

  updateCategory: async (id, category) => {
    const currentStoreId = useAuthStore.getState().currentStoreId;
    if (!currentStoreId) {
      throw new Error('Store not selected');
    }
    await api.updateCategory(id, category);
    cache.delete(cacheKeys.categories(currentStoreId));
    await get().fetchCategories();
  },

  deleteCategory: async (id) => {
    const currentStoreId = useAuthStore.getState().currentStoreId;
    if (!currentStoreId) {
      throw new Error('Store not selected');
    }
    await api.deleteCategory(id);
    cache.delete(cacheKeys.categories(currentStoreId));
    await get().fetchCategories();
  },

  // Items
  fetchItems: async () => {
    const currentStoreId = useAuthStore.getState().currentStoreId;
    if (!currentStoreId) return;
    try {
      const cacheKey = cacheKeys.items(currentStoreId);
      
      // Try cache first
      const cached = cache.get<Item[]>(cacheKey);
      if (cached) {
        set({ items: cached });
        return;
      }
      
      const items = await api.getItems(currentStoreId);
      cache.set(cacheKey, items);
      set({ items });
    } catch (error) {
      console.error('Failed to fetch items:', error);
    }
  },

  createItem: async (item) => {
    const currentStoreId = useAuthStore.getState().currentStoreId;
    if (!currentStoreId) {
      throw new Error('Store not selected');
    }
    await api.createItem({ ...item, storeId: currentStoreId });
    cache.delete(cacheKeys.items(currentStoreId));
    await get().fetchItems();
  },

  updateItem: async (id, item) => {
    const currentStoreId = useAuthStore.getState().currentStoreId;
    if (!currentStoreId) {
      throw new Error('Store not selected');
    }
    await api.updateItem(id, item);
    cache.delete(cacheKeys.items(currentStoreId));
    await get().fetchItems();
  },

  deleteItem: async (id) => {
    const currentStoreId = useAuthStore.getState().currentStoreId;
    if (!currentStoreId) {
      throw new Error('Store not selected');
    }
    await api.deleteItem(id);
    cache.delete(cacheKeys.items(currentStoreId));
    await get().fetchItems();
  },

  // Tables
  fetchTables: async () => {
    const currentStoreId = useAuthStore.getState().currentStoreId;
    if (!currentStoreId) return;
    try {
      const tables = await api.getTables(currentStoreId);
      set({ tables });
    } catch (error) {
      console.error('Failed to fetch tables:', error);
    }
  },

  createTable: async (table) => {
    const currentStoreId = useAuthStore.getState().currentStoreId;
    if (!currentStoreId) {
      throw new Error('Store not selected');
    }
    await api.createTable({ ...table, storeId: currentStoreId });
    await get().fetchTables();
  },

  updateTable: async (id, table) => {
    const currentStoreId = useAuthStore.getState().currentStoreId;
    await api.updateTable(id, table);
    await get().fetchTables();
  },

  deleteTable: async (id) => {
    const currentStoreId = useAuthStore.getState().currentStoreId;
    await api.deleteTable(id);
    await get().fetchTables();
  },

  // Orders
  fetchOrders: async () => {
    const currentStoreId = useAuthStore.getState().currentStoreId;
    if (!currentStoreId) return;
    try {
      const orders = await api.getOrders(currentStoreId);
      set({ orders });
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    }
  },

  createOrder: async (order) => {
    let currentStoreId = useAuthStore.getState().currentStoreId;
    let currentUser = useAuthStore.getState().user;
    
    console.log('[DataStore] Auth check:', { currentStoreId, currentUser, hasStoreId: !!currentStoreId, hasUser: !!currentUser });
    
    // If user is null, try to refresh from server
    if (!currentUser) {
      console.log('[DataStore] User is null, attempting to refresh...');
      const authStore = useAuthStore.getState();
      currentUser = await authStore.refreshUser();
      currentStoreId = authStore.currentStoreId;
      console.log('[DataStore] After refresh:', { currentUser, currentStoreId });
    }
    
    if (!currentStoreId || !currentUser) {
      console.error('[DataStore] Auth failed:', { currentStoreId, currentUser });
      throw new Error('User or store not authenticated');
    }
    console.log('[DataStore] Creating order', { order, currentStoreId, userId: currentUser.id });
    const newOrder = await api.createOrder({
      ...order,
      storeId: currentStoreId,
      createdBy: currentUser.id,
    });
    console.log('[DataStore] Order created successfully', newOrder);
    await get().fetchOrders();
    return newOrder;
  },

  saveEBill: async (order) => {
    const currentStoreId = useAuthStore.getState().currentStoreId;
    const currentUser = useAuthStore.getState().user;
    if (!currentStoreId || !currentUser) {
      throw new Error('User or store not authenticated');
    }
    const savedOrder = await api.saveEBill({
      ...order,
      storeId: currentStoreId,
      createdBy: currentUser.id,
    });
    await get().fetchOrders();
    await get().fetchBills();
    return savedOrder;
  },

  savePrint: async (orderId, bill) => {
    const currentStoreId = useAuthStore.getState().currentStoreId;
    const currentUser = useAuthStore.getState().user;
    if (!currentStoreId || !currentUser) {
      throw new Error('User or store not authenticated');
    }
    await api.savePrint(orderId, {
      ...bill,
      storeId: currentStoreId,
      generatedBy: currentUser.id,
    });
    await get().fetchOrders();
    await get().fetchBills();
  },

  updateOrder: async (id, order) => {
    const currentStoreId = useAuthStore.getState().currentStoreId;
    if (!currentStoreId) {
      throw new Error('Store not selected');
    }
    console.log('[DataStore] Updating order', { id, order });
    await api.updateOrder(id, order);
    console.log('[DataStore] Order updated successfully');
    await get().fetchOrders();
  },

  completeOrder: async (id, paymentMethod) => {
    const currentStoreId = useAuthStore.getState().currentStoreId;
    if (!currentStoreId) {
      throw new Error('Store not selected');
    }
    await api.completeOrder(id, paymentMethod);
    await get().fetchOrders();
  },

  cancelOrder: async (id) => {
    const currentStoreId = useAuthStore.getState().currentStoreId;
    if (!currentStoreId) {
      throw new Error('Store not selected');
    }
    await api.cancelOrder(id);
    await get().fetchOrders();
  },

  getActiveOrderByTable: (tableId) => {
    return get().orders.find(o => o.tableId === tableId && o.status === 'active');
  },

  // Bills
  fetchBills: async (bypassCache = false) => {
    const currentStoreId = useAuthStore.getState().currentStoreId;
    if (!currentStoreId) return;
    try {
      const cacheKey = cacheKeys.bills(currentStoreId);
      
      if (!bypassCache) {
        // Try cache first
        const cached = cache.get<Bill[]>(cacheKey);
        if (cached) {
          set({ bills: cached });
          return;
        }
      }
      
      const bills = await api.getBills(currentStoreId);
      cache.set(cacheKey, bills, 3 * 60 * 1000); // 3 minutes TTL for bills
      set({ bills });
    } catch (error) {
      console.error('Failed to fetch bills:', error);
    }
  },

  createBill: async (bill) => {
    const currentStoreId = useAuthStore.getState().currentStoreId;
    const currentUser = useAuthStore.getState().user;
    if (!currentStoreId || !currentUser) {
      throw new Error('User or store not authenticated');
    }
    await api.createBill({
      ...bill,
      storeId: currentStoreId,
      generatedBy: currentUser.id,
    });
    cache.delete(cacheKeys.bills(currentStoreId));
    await get().fetchBills();
  },

  enqueueBill: async (bill) => {
    const currentStoreId = useAuthStore.getState().currentStoreId;
    const currentUser = useAuthStore.getState().user;
    if (!currentStoreId || !currentUser) {
      throw new Error('User or store not authenticated');
    }
    const currentStore = get().stores.find(s => s.id === currentStoreId);
    if (!currentStore?.remoteBillingEnabled) {
      throw new Error('Remote Billing is not enabled for this store.');
    }

    await api.enqueueBill({
      ...bill,
      storeId: currentStoreId,
      generatedBy: currentUser.id,
    });
    // Mark order as completed and release the table
    await api.completeOrder(bill.orderId, bill.paymentMethod || 'cash');
    await get().fetchOrders();
  },

  getNextInvoiceNo: async () => {
    const currentStoreId = useAuthStore.getState().currentStoreId;
    if (!currentStoreId) {
      throw new Error('Store not selected');
    }
    return api.getNextInvoiceNo(currentStoreId);
  },

  fetchBillQueue: async () => {
    const currentStoreId = useAuthStore.getState().currentStoreId;
    if (!currentStoreId) return;
    try {
      const billQueue = await api.getBillQueue(currentStoreId);
      set({ billQueue: billQueue || [] });
    } catch (error) {
      console.error('Failed to fetch bill queue:', error);
    }
  },

  // Users
  fetchUsers: async () => {
    try {
      const cacheKey = cacheKeys.users();
      
      // Try cache first
      const cached = cache.get<any[]>(cacheKey);
      if (cached) {
        set({ users: cached });
        return;
      }
      
      const users = await api.getUsers();
      cache.set(cacheKey, users);
      set({ users });
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  },

  createUser: async (user) => {
    try {
      await api.createUser(user);
      cache.delete(cacheKeys.users());
      await get().fetchUsers();
    } catch (error: any) {
      console.error('Create user error:', error);
      throw error;
    }
  },

  updateUser: async (id, user) => {
    await api.updateUser(id, user);
    cache.delete(cacheKeys.users());
    await get().fetchUsers();
  },

  deleteUser: async (id) => {
    await api.deleteUser(id);
    cache.delete(cacheKeys.users());
    await get().fetchUsers();
  },

  changePassword: async (currentPassword, newPassword) => {
    await api.changePassword(currentPassword, newPassword);
  },

  resetPassword: async (userId, password) => {
    await api.resetPassword(userId, password);
  },

  // Expense Categories
  fetchExpenseCategories: async () => {
    const currentStoreId = useAuthStore.getState().currentStoreId;
    if (!currentStoreId) return;
    try {
      const expenseCategories = await api.getExpenseCategories(currentStoreId);
      set({ expenseCategories });
    } catch (error) {
      console.error('Failed to fetch expense categories:', error);
    }
  },

  createExpenseCategory: async (category) => {
    const currentStoreId = useAuthStore.getState().currentStoreId;
    if (!currentStoreId) {
      throw new Error('Store not selected');
    }
    await api.createExpenseCategory({ ...category, storeId: currentStoreId });
    await get().fetchExpenseCategories();
  },

  updateExpenseCategory: async (id, category) => {
    await api.updateExpenseCategory(id, category);
    await get().fetchExpenseCategories();
  },

  deleteExpenseCategory: async (id) => {
    await api.deleteExpenseCategory(id);
    await get().fetchExpenseCategories();
  },

  // Expenses
  fetchExpenses: async (startDate, endDate) => {
    const currentStoreId = useAuthStore.getState().currentStoreId;
    if (!currentStoreId) return;
    try {
      const expenses = await api.getExpenses(currentStoreId, startDate, endDate);
      set({ expenses });
    } catch (error) {
      console.error('Failed to fetch expenses:', error);
    }
  },

  createExpense: async (expense) => {
    const currentStoreId = useAuthStore.getState().currentStoreId;
    const currentUser = useAuthStore.getState().user;
    if (!currentStoreId || !currentUser) {
      throw new Error('User or store not authenticated');
    }
    await api.createExpense({
      ...expense,
      storeId: currentStoreId,
      createdBy: currentUser.id,
    });
    await get().fetchExpenses();
  },

  updateExpense: async (id, expense) => {
    await api.updateExpense(id, expense);
    await get().fetchExpenses();
  },

  deleteExpense: async (id) => {
    await api.deleteExpense(id);
    await get().fetchExpenses();
  },
}));
