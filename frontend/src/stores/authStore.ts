import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { api } from '../services/api';
import type { User } from '../types';
import { useDataStore } from './dataStore';

// Helper to clear persisted auth storage
const clearAuthStorage = () => {
  localStorage.removeItem('cafe-auth');
  localStorage.removeItem('cafe_token');
  localStorage.removeItem('cafe-user');
};

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  currentStoreId: string | null;
  
  // Actions
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  clearAuth: () => void; // New action to completely clear auth state
  validateToken: () => Promise<boolean>; // Validate token on app load
  setUser: (user: User) => void;
  setCurrentStore: (storeId: string) => void;
  getCurrentStore: () => { id: string; name: string; branch?: string } | undefined;
  canSwitchStores: () => boolean;
  ensureStoreSelected: () => void;
  checkStoreActive: () => boolean;
  refreshUser: () => Promise<User | null>;
}

// Helper to get default store ID for a user
const getDefaultStoreId = (user: User | null): string | null => {
  if (!user) return null;
  
  // For business_admin and staff, use their assigned store_id
  if (user.role === 'business_admin' || user.role === 'staff') {
    return user.storeId || null;
  }
  
  // For superadmin and business_owner, use first available store
  return user.stores?.[0]?.id || null;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      isAuthenticated: false,
      currentStoreId: null,

      login: async (username: string, password: string) => {
        // Clear any existing auth state before attempting login
        get().clearAuth();
        
        set({ isLoading: true });
        try {
          const data = await api.login(username, password);
          if (data.token && data.user) {
            api.setToken(data.token);
            
            // Set current store to default for this user
            const defaultStoreId = getDefaultStoreId(data.user);
            
            // Check if business_admin or staff has a store assigned
            if ((data.user.role === 'business_admin' || data.user.role === 'staff') && !defaultStoreId) {
              get().clearAuth();
              throw new Error('No store assigned. Please contact your administrator.');
            }
            
            set({
              user: data.user,
              token: data.token,
              isAuthenticated: true,
              currentStoreId: defaultStoreId,
            });
            return true;
          }
          return false;
        } catch (error: any) {
          console.error('Login error:', error);
          // Ensure auth state is cleared on error
          get().clearAuth();
          // Preserve the error message from the backend
          const errorMessage = error?.message || error?.toString() || 'Login failed. Please try again.';
          throw new Error(errorMessage);
        } finally {
          set({ isLoading: false });
        }
      },

      clearAuth: () => {
        clearAuthStorage();
        api.clearToken();
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          currentStoreId: null,
        });
      },

      validateToken: async () => {
        const { token } = get();
        if (!token) {
          get().clearAuth();
          return false;
        }
        try {
          await api.getMe();
          return true;
        } catch (error) {
          // Only clear auth if the token was invalidated by a 401 response.
          // For network errors or server errors (5xx), keep the session intact
          // so role-based menus don't disappear on transient failures.
          if (!api.getToken()) {
            get().clearAuth();
          }
          return false;
        }
      },

      checkStoreActive: () => {
        const { user, currentStoreId } = get();
        if (!user || user.role === 'superadmin' || user.role === 'business_owner') return true;
        
        const store = user.stores?.find(s => s.id === currentStoreId);
        return store?.isActive ?? true;
      },

      refreshUser: async () => {
        try {
          const data = await api.getMe();
          const { currentStoreId: existingStoreId } = get();
          const defaultStoreId = getDefaultStoreId(data.user);
          
          // Preserve existing store selection if it's still valid for the user
          // Only reset to default if no store is currently selected
          const newStoreId = existingStoreId || defaultStoreId;
          
          set({
            user: data.user,
            currentStoreId: newStoreId,
          });
          return data.user;
        } catch (error) {
          console.error('Failed to refresh user:', error);
          return null;
        }
      },

      logout: () => {
        get().clearAuth();
      },

      setUser: (user: User) => {
        set({ user });
      },

      setCurrentStore: (storeId: string) => {
        set({ currentStoreId: storeId });
      },

      getCurrentStore: () => {
        const { user, currentStoreId } = get();
        if (!currentStoreId) return undefined;
        // First check user.stores (from session), fallback to finding in any available stores
        const fromUser = user?.stores?.find(s => s.id === currentStoreId);
        if (fromUser) return fromUser;
        // If not in user.stores (e.g., newly created), try to get from dataStore
        try {
          const dataStore = useDataStore.getState();
          return dataStore?.stores?.find((s: any) => s.id === currentStoreId);
        } catch {
          return undefined;
        }
      },

      canSwitchStores: () => {
        const { user } = get();
        if (!user) return false;
        return user.role === 'superadmin' || user.role === 'business_owner';
      },

      ensureStoreSelected: () => {
        const { user, currentStoreId } = get();
        
        // If no store is selected but user has a default store, set it
        if (!currentStoreId && user) {
          const defaultStoreId = getDefaultStoreId(user);
          if (defaultStoreId) {
            set({ currentStoreId: defaultStoreId });
          }
        }
      },
    }),
    {
      name: 'cafe-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        currentStoreId: state.currentStoreId,
      }),
    }
  )
);
