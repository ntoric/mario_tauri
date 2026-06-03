/// <reference types="vite/client" />

const API_URL = import.meta.env.VITE_BACKEND_URL ||
  import.meta.env.VITE_API_URL ||
  (window.location.protocol === 'file:'
    ? 'http://localhost:8088/api'
    : '/api');

// Log API URL for debugging
console.log('API URL configured as:', API_URL);

class ApiService {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('cafe_token', token);
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('cafe_token');
    }
    return this.token;
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('cafe_token');
    localStorage.removeItem('cafe-auth');
    // Also clear any other auth-related keys
    localStorage.removeItem('cafe-user');
  }

  private async fetch(endpoint: string, options: RequestInit = {}, skipAuthRedirect = false) {
    const url = `${API_URL}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>,
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      if (response.status === 401 && !skipAuthRedirect) {
        this.clearToken();
        window.location.replace('/#/login');
      }
      const contentType = response.headers.get('content-type');
      let error;
      if (contentType && contentType.includes('application/json')) {
        error = await response.json();
      } else {
        const text = await response.text();
        console.error('Non-JSON response:', text);
        error = { error: `Server returned non-JSON response (${response.status}): ${text.substring(0, 100)}` };
      }
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  }

  // Auth
  async login(username: string, password: string) {
    try {
      const data = await this.fetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }, true); // Skip auth redirect on 401
      if (data.token) {
        this.setToken(data.token);
      }
      return data;
    } catch (error) {
      // Clear any existing token on failed login
      this.clearToken();
      throw error;
    }
  }

  async getMe() {
    return this.fetch('/auth/me');
  }

  // Stores
  async getStores() {
    return this.fetch('/stores');
  }

  async getStore(id: string) {
    return this.fetch(`/stores/${id}`);
  }

  async createStore(store: any) {
    return this.fetch('/stores', {
      method: 'POST',
      body: JSON.stringify(store),
    });
  }

  async updateStore(id: string, store: any) {
    return this.fetch(`/stores/${id}`, {
      method: 'PUT',
      body: JSON.stringify(store),
    });
  }

  async deleteStore(id: string) {
    return this.fetch(`/stores/${id}`, {
      method: 'DELETE',
    });
  }

  async switchStore(storeId: string) {
    return this.fetch('/stores/switch', {
      method: 'POST',
      body: JSON.stringify({ storeId }),
    });
  }

  async uploadStoreLogo(id: string, logoBase64: string) {
    return this.fetch(`/stores/${id}/logo`, {
      method: 'POST',
      body: JSON.stringify({ logoBase64 }),
    });
  }

  async deleteStoreLogo(id: string) {
    return this.fetch(`/stores/${id}/logo`, {
      method: 'DELETE',
    });
  }

  // Users
  async getUsers() {
    return this.fetch('/users');
  }

  async createUser(user: any) {
    return this.fetch('/users', {
      method: 'POST',
      body: JSON.stringify(user),
    });
  }

  async updateUser(id: string, user: any) {
    return this.fetch(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(user),
    });
  }

  async deleteUser(id: string) {
    return this.fetch(`/users/${id}`, {
      method: 'DELETE',
    });
  }

  // Change own password (requires current password)
  async changePassword(currentPassword: string, newPassword: string) {
    return this.fetch('/users/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  // Admin reset password (superadmin and business_owner)
  async resetPassword(userId: string, password: string) {
    return this.fetch(`/users/${userId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  }

  // Categories
  async getCategories(storeId: string) {
    return this.fetch(`/categories?storeId=${storeId}`);
  }

  async createCategory(category: any) {
    return this.fetch('/categories', {
      method: 'POST',
      body: JSON.stringify(category),
    });
  }

  async updateCategory(id: string, category: any) {
    return this.fetch(`/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(category),
    });
  }

  async deleteCategory(id: string) {
    return this.fetch(`/categories/${id}`, {
      method: 'DELETE',
    });
  }

  // Items
  async getItems(storeId: string) {
    return this.fetch(`/items?storeId=${storeId}`);
  }

  async createItem(item: any) {
    return this.fetch('/items', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  }

  async updateItem(id: string, item: any) {
    return this.fetch(`/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(item),
    });
  }

  async deleteItem(id: string) {
    return this.fetch(`/items/${id}`, {
      method: 'DELETE',
    });
  }

  // Tables
  async getTables(storeId: string) {
    return this.fetch(`/tables?storeId=${storeId}`);
  }

  async createTable(table: any) {
    return this.fetch('/tables', {
      method: 'POST',
      body: JSON.stringify(table),
    });
  }

  async updateTable(id: string, table: any) {
    return this.fetch(`/tables/${id}`, {
      method: 'PUT',
      body: JSON.stringify(table),
    });
  }

  async deleteTable(id: string) {
    return this.fetch(`/tables/${id}`, {
      method: 'DELETE',
    });
  }

  // Orders
  async getOrders(storeId: string, status?: string) {
    let url = `/orders?storeId=${storeId}`;
    if (status) url += `&status=${status}`;
    return this.fetch(url);
  }

  async createOrder(order: any) {
    return this.fetch('/orders', {
      method: 'POST',
      body: JSON.stringify(order),
    });
  }

  async createParcelOrder(order: any) {
    return this.fetch('/orders/parcel', {
      method: 'POST',
      body: JSON.stringify(order),
    });
  }

  async updateOrder(id: string, order: any) {
    return this.fetch(`/orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(order),
    });
  }

  async completeOrder(id: string, paymentMethod?: string) {
    return this.fetch(`/orders/${id}/complete`, {
      method: 'PATCH',
      body: JSON.stringify({ paymentMethod }),
    });
  }

  async cancelOrder(id: string) {
    return this.fetch(`/orders/${id}/cancel`, {
      method: 'PATCH',
    });
  }

  // Bills
  async getBills(storeId: string) {
    return this.fetch(`/bills?storeId=${storeId}`);
  }

  async createBill(bill: any) {
    return this.fetch('/bills', {
      method: 'POST',
      body: JSON.stringify(bill),
    });
  }

  async enqueueBill(bill: any) {
    return this.fetch('/bills/queue', {
      method: 'POST',
      body: JSON.stringify(bill),
    });
  }

  async getBillQueue(storeId: string) {
    return this.fetch(`/bills/queue?storeId=${storeId}`);
  }

  async getNextInvoiceNo(storeId: string) {
    const result = await this.fetch(`/bills/next-invoice-no?storeId=${storeId}`);
    return result.invoiceNo;
  }

  // System Reset (superadmin only)
  async getSystemStats() {
    return this.fetch('/system/stats');
  }

  async resetSystem(options: {
    users?: boolean;
    stores?: boolean;
    categories?: boolean;
    items?: boolean;
    orders?: boolean;
    tables?: boolean;
    bills?: boolean;
  }) {
    return this.fetch('/system/reset', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  async getSystemConfig() {
    return this.fetch('/system/config');
  }

  async updateSystemConfig(config: { cleanupEnabled: boolean; cleanupIntervalMins: number }) {
    return this.fetch('/system/config', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  // App Update Management
  async getAppUpdate(platform: string = 'mobile') {
    return this.fetch(`/app-update?platform=${platform}`);
  }

  async getAllAppUpdates() {
    return this.fetch('/app-updates');
  }

  async updateAppUpdate(config: {
    platform: string;
    enabled: boolean;
    version: string;
    downloadUrl: string;
    releaseNotes: string;
  }) {
    return this.fetch('/app-update', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

}

export const api = new ApiService();
