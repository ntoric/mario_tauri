/// <reference types="vite/client" />

const API_URL = import.meta.env.VITE_BACKEND_URL ||
  import.meta.env.VITE_API_URL ||
  'https://mario-v2-backend.ntoric.com/api';

// Log API URL for debugging
console.log('API URL configured as:', API_URL);
console.log('Window location:', window.location.href);
console.log('Build mode:', import.meta.env.MODE);

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

    console.log(`Fetching: ${url}`);
    console.log(`Token present: ${!!token}`);
    console.log(`Token length: ${token?.length || 0}`);
    const response = await fetch(url, {
      ...options,
      headers,
    });

    console.log(`Response URL: ${response.url}`);
    console.log(`Response status: ${response.status}`);

    if (!response.ok) {
      console.error(`[API ERROR] Request failed: ${response.status} ${response.statusText}`);
      if (response.status === 401 && !skipAuthRedirect) {
        console.error('[API ERROR] 401 Unauthorized - clearing token and redirecting to login');
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

    const text = await response.text();
    console.log(`Response content-type: ${response.headers.get('content-type')}`);
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error('Failed to parse JSON response:', text.substring(0, 200));
      throw new Error('Invalid JSON response from server');
    }
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
  async getItems(storeId: string, includeProfit = false) {
    let url = `/items?storeId=${storeId}`;
    if (includeProfit) url += '&includeProfit=true';
    return this.fetch(url);
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

  // Item Expenses
  async getItemExpenses(itemId: string) {
    return this.fetch(`/items/${itemId}/expenses`);
  }

  async createItemExpense(itemId: string, expense: { name: string; description?: string; amount: number; storeId?: string }) {
    return this.fetch(`/items/${itemId}/expenses`, {
      method: 'POST',
      body: JSON.stringify(expense),
    });
  }

  async updateItemExpense(id: string, expense: { name: string; description?: string; amount: number; storeId?: string }) {
    return this.fetch(`/item-expenses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(expense),
    });
  }

  async deleteItemExpense(id: string, storeId?: string) {
    let url = `/item-expenses/${id}`;
    if (storeId) url += `?storeId=${storeId}`;
    return this.fetch(url, {
      method: 'DELETE',
    });
  }

  async getItemProfitReport(storeId: string) {
    return this.fetch(`/reports/item-profit?storeId=${storeId}`);
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

  // Table sections (bulk operations)
  async renameTableSection(oldName: string, newName: string) {
    return this.fetch('/tables/sections/rename', {
      method: 'PUT',
      body: JSON.stringify({ oldName, newName }),
    });
  }

  async deleteTableSection(name: string) {
    return this.fetch(`/tables/sections/${encodeURIComponent(name)}`, {
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
    console.log('[API] Creating order', order);
    const result = await this.fetch('/orders', {
      method: 'POST',
      body: JSON.stringify(order),
    });
    console.log('[API] Order created response', result);
    return result;
  }

  async createParcelOrder(order: any) {
    return this.fetch('/orders/parcel', {
      method: 'POST',
      body: JSON.stringify(order),
    });
  }

  async saveEBill(order: any) {
    return this.fetch('/orders/save-ebill', {
      method: 'POST',
      body: JSON.stringify(order),
    });
  }

  async savePrint(orderId: string, bill: any) {
    return this.fetch(`/orders/${orderId}/save-print`, {
      method: 'POST',
      body: JSON.stringify(bill),
    });
  }

  async updateOrder(id: string, order: any) {
    console.log('[API] Updating order', { id, order });
    const result = await this.fetch(`/orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(order),
    });
    console.log('[API] Order updated response', result);
    return result;
  }

  async completeOrder(id: string, paymentMethod?: string) {
    return this.fetch(`/orders/${id}/complete`, {
      method: 'PATCH',
      body: JSON.stringify({ paymentMethod }),
    });
  }

  async cancelOrder(id: string, reason?: string) {
    return this.fetch(`/orders/${id}/cancel`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
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

  // Expense Categories
  async getExpenseCategories(storeId: string) {
    return this.fetch(`/expense-categories?storeId=${storeId}`);
  }

  async createExpenseCategory(category: any) {
    return this.fetch('/expense-categories', {
      method: 'POST',
      body: JSON.stringify(category),
    });
  }

  async updateExpenseCategory(id: string, category: any) {
    return this.fetch(`/expense-categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(category),
    });
  }

  async deleteExpenseCategory(id: string) {
    return this.fetch(`/expense-categories/${id}`, {
      method: 'DELETE',
    });
  }

  // Expenses
  async getExpenses(storeId: string, startDate?: string, endDate?: string) {
    let url = `/expenses?storeId=${storeId}`;
    if (startDate) url += `&startDate=${startDate}`;
    if (endDate) url += `&endDate=${endDate}`;
    return this.fetch(url);
  }

  async getExpense(id: string) {
    return this.fetch(`/expenses/${id}`);
  }

  async createExpense(expense: any) {
    return this.fetch('/expenses', {
      method: 'POST',
      body: JSON.stringify(expense),
    });
  }

  async updateExpense(id: string, expense: any) {
    return this.fetch(`/expenses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(expense),
    });
  }

  async deleteExpense(id: string) {
    return this.fetch(`/expenses/${id}`, {
      method: 'DELETE',
    });
  }

  // Expense Reports
  async getExpenseReportByCategory(storeId: string, startDate?: string, endDate?: string) {
    let url = `/expenses/report/by-category?storeId=${storeId}`;
    if (startDate) url += `&startDate=${startDate}`;
    if (endDate) url += `&endDate=${endDate}`;
    return this.fetch(url);
  }

  async getExpenseSummaryByDate(storeId: string, startDate?: string, endDate?: string) {
    let url = `/expenses/report/by-date?storeId=${storeId}`;
    if (startDate) url += `&startDate=${startDate}`;
    if (endDate) url += `&endDate=${endDate}`;
    return this.fetch(url);
  }

  // Revenue Report
  async getRevenueReport(storeId: string, startDate?: string, endDate?: string) {
    let url = `/reports/revenue?storeId=${storeId}`;
    if (startDate) url += `&startDate=${startDate}`;
    if (endDate) url += `&endDate=${endDate}`;
    return this.fetch(url);
  }

}

export const api = new ApiService();
