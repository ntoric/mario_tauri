import { create } from 'zustand';

interface ModalState {
  isOpen: boolean;
  data?: any;
}

interface UIState {
  // Modals
  orderModal: ModalState;
  parcelOrderModal: ModalState;
  billModal: ModalState;
  itemModal: ModalState;
  categoryModal: ModalState;
  userModal: ModalState;
  storeModal: ModalState;
  storeSwitcherModal: boolean;

  // Sidebar
  sidebarOpen: boolean;

  // Notifications
  notifications: Array<{
    id: string;
    type: 'success' | 'error' | 'info';
    message: string;
  }>;

  // Actions
  openOrderModal: (data?: any) => void;
  closeOrderModal: () => void;
  openParcelOrderModal: () => void;
  closeParcelOrderModal: () => void;
  openBillModal: (data?: any) => void;
  closeBillModal: () => void;
  openItemModal: (data?: any) => void;
  closeItemModal: () => void;
  openCategoryModal: (data?: any) => void;
  closeCategoryModal: () => void;
  openUserModal: (data?: any) => void;
  closeUserModal: () => void;
  openStoreModal: (data?: any) => void;
  closeStoreModal: () => void;
  openStoreSwitcher: () => void;
  closeStoreSwitcher: () => void;
  toggleSidebar: () => void;
  addNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  removeNotification: (id: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  orderModal: { isOpen: false },
  parcelOrderModal: { isOpen: false },
  billModal: { isOpen: false },
  itemModal: { isOpen: false },
  categoryModal: { isOpen: false },
  userModal: { isOpen: false },
  storeModal: { isOpen: false },
  storeSwitcherModal: false,
  sidebarOpen: true,
  notifications: [],

  openOrderModal: (data) => set({ orderModal: { isOpen: true, data } }),
  closeOrderModal: () => set({ orderModal: { isOpen: false, data: null } }),
  openParcelOrderModal: () => set({ parcelOrderModal: { isOpen: true } }),
  closeParcelOrderModal: () => set({ parcelOrderModal: { isOpen: false } }),

  openBillModal: (data) => set({ billModal: { isOpen: true, data } }),
  closeBillModal: () => set({ billModal: { isOpen: false } }),
  
  openItemModal: (data) => set({ itemModal: { isOpen: true, data } }),
  closeItemModal: () => set({ itemModal: { isOpen: false } }),
  
  openCategoryModal: (data) => set({ categoryModal: { isOpen: true, data } }),
  closeCategoryModal: () => set({ categoryModal: { isOpen: false } }),
  
  openUserModal: (data) => set({ userModal: { isOpen: true, data } }),
  closeUserModal: () => set({ userModal: { isOpen: false } }),
  
  openStoreModal: (data) => set({ storeModal: { isOpen: true, data } }),
  closeStoreModal: () => set({ storeModal: { isOpen: false } }),
  
  openStoreSwitcher: () => set({ storeSwitcherModal: true }),
  closeStoreSwitcher: () => set({ storeSwitcherModal: false }),
  
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  
  addNotification: (type, message) => {
    const id = Math.random().toString(36).substring(7);
    set((state) => ({
      notifications: [...state.notifications, { id, type, message }],
    }));
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      }));
    }, 5000);
  },
  
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
}));
