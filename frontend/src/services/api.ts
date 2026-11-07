/// <reference types="vite/client" />

import { authStorage, AUTH_KEYS } from './authStorage';

export const API_URL = import.meta.env.VITE_BACKEND_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:8088/api';

// Log API URL for debugging
if (import.meta.env.DEV) {
  console.log('API URL configured as:', API_URL);
}

class ApiService {
  private token: string | null = null;

  // Load the persisted token once at bootstrap, before the UI issues
  // requests — the store plugin's read is async, so getToken() stays sync.
  async hydrateToken() {
    this.token = (await authStorage.getItem('cafe_token')) ?? null;
  }

  setToken(token: string) {
    this.token = token;
    void authStorage.setItem('cafe_token', token);
  }

  getToken(): string | null {
    if (!this.token) {
      // Web builds keep the token in localStorage; hydrateToken() covers the
      // Tauri path before first render.
      this.token = localStorage.getItem('cafe_token');
    }
    return this.token;
  }

  clearToken() {
    this.token = null;
    for (const key of AUTH_KEYS) {
      void authStorage.removeItem(key);
    }
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
      const err = new Error(error.error || 'Request failed');
      // Carry the HTTP status so callers can special-case e.g. 409 conflicts.
      (err as Error & { status?: number }).status = response.status;
      throw err;
    }

    const text = await response.text();
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

  async logout() {
    // Invalidate the server-side session, then clear the local token.
    try {
      await this.fetch('/auth/logout', { method: 'POST' }, true);
    } finally {
      this.clearToken();
    }
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

  async reorderCategories(storeId: string, categoryIds: string[]) {
    return this.fetch('/categories/reorder', {
      method: 'POST',
      body: JSON.stringify({ storeId, categoryIds }),
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

  // Table sections (catalog + bulk operations)
  async getTableSections(storeId: string) {
    return this.fetch(`/tables/sections?storeId=${storeId}`);
  }

  async createTableSection(storeId: string, name: string) {
    return this.fetch('/tables/sections', {
      method: 'POST',
      body: JSON.stringify({ storeId, name }),
    });
  }

  async renameTableSection(storeId: string, oldName: string, newName: string) {
    return this.fetch('/tables/sections/rename', {
      method: 'PUT',
      body: JSON.stringify({ storeId, oldName, newName }),
    });
  }

  async setDefaultTableSection(storeId: string, name: string) {
    return this.fetch('/tables/sections/default', {
      method: 'PUT',
      body: JSON.stringify({ storeId, name }),
    });
  }

  async deleteTableSection(storeId: string, name: string) {
    return this.fetch(`/tables/sections/${encodeURIComponent(name)}?storeId=${storeId}`, {
      method: 'DELETE',
    });
  }

  // Orders
  async getOrders(storeId: string, status?: string, limit?: number, sort?: string) {
    let url = `/orders?storeId=${storeId}`;
    if (status) url += `&status=${status}`;
    if (limit) url += `&limit=${limit}`;
    if (sort) url += `&sort=${sort}`;
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

  async cancelOrder(id: string, reason?: string) {
    return this.fetch(`/orders/${id}/cancel`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    });
  }

  // Folds mergeOrderId's items/totals into order `id`; the merged order's
  // table is released so a single bill can be generated for `id`.
  async mergeOrders(id: string, mergeOrderId: string) {
    return this.fetch(`/orders/${id}/merge`, {
      method: 'POST',
      body: JSON.stringify({ mergeOrderId }),
    });
  }

  // Bills
  // limit: absent → server default; 0 → all bills (backward compatible)
  async getBills(storeId: string, limit?: number) {
    let url = `/bills?storeId=${storeId}`;
    if (limit !== undefined) url += `&limit=${limit}`;
    return this.fetch(url);
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

  async getBillQueue(storeId: string, deviceId: string) {
    return this.fetch(`/bills/queue?storeId=${storeId}&deviceId=${encodeURIComponent(deviceId)}`);
  }

  async claimBillQueueItem(queueId: string, storeId: string, deviceId: string) {
    return this.fetch(`/bills/queue/${queueId}/claim`, {
      method: 'POST',
      body: JSON.stringify({ storeId, deviceId }),
    });
  }

  async ackBillQueueItem(queueId: string, storeId: string, deviceId: string, status: 'printed' | 'failed', error?: string) {
    return this.fetch(`/bills/queue/${queueId}/ack`, {
      method: 'POST',
      body: JSON.stringify({ storeId, deviceId, status, error }),
    });
  }

  async getBillQueueStatus(queueId: string, storeId: string) {
    return this.fetch(`/bills/queue/${queueId}/status?storeId=${storeId}`);
  }

  async getNextInvoiceNo(storeId: string) {
    const result = await this.fetch(`/bills/next-invoice-no?storeId=${storeId}`);
    return result.invoiceNo;
  }

  // GST
  async getGstMeta() {
    return this.fetch('/gst/meta');
  }

  async previewBill(req: {
    storeId: string; orderId?: string;
    items?: { itemId: string; quantity: number; unitPrice?: number }[];
    discount?: number; buyerGstin?: string; buyerStateCode?: string; orderSource?: string;
  }) {
    return this.fetch('/bills/preview', { method: 'POST', body: JSON.stringify(req) });
  }

  async getBill(id: string) {
    return this.fetch(`/bills/${id}`);
  }

  async createCreditNote(billId: string, req: { reason: string; lines?: { billLineId: number; quantity: number }[] }) {
    return this.fetch(`/bills/${billId}/credit-notes`, { method: 'POST', body: JSON.stringify(req) });
  }

  async getCreditNotes(storeId: string, opts?: { startDate?: string; endDate?: string; billId?: string }) {
    let url = `/credit-notes?storeId=${storeId}`;
    if (opts?.startDate) url += `&startDate=${opts.startDate}`;
    if (opts?.endDate) url += `&endDate=${opts.endDate}`;
    if (opts?.billId) url += `&billId=${opts.billId}`;
    return this.fetch(url);
  }

  async getCreditNote(id: string) {
    return this.fetch(`/credit-notes/${id}`);
  }

  async getGstSummary(storeId: string, startDate?: string, endDate?: string) {
    let url = `/reports/gst/summary?storeId=${storeId}`;
    if (startDate) url += `&startDate=${startDate}`;
    if (endDate) url += `&endDate=${endDate}`;
    return this.fetch(url);
  }

  async getGstr1(storeId: string, startDate?: string, endDate?: string) {
    let url = `/reports/gst/gstr1?storeId=${storeId}`;
    if (startDate) url += `&startDate=${startDate}`;
    if (endDate) url += `&endDate=${endDate}`;
    return this.fetch(url);
  }

  async getGstr1PortalJson(storeId: string, startDate?: string, endDate?: string) {
    let url = `/reports/gst/gstr1/portal-json?storeId=${storeId}`;
    if (startDate) url += `&startDate=${startDate}`;
    if (endDate) url += `&endDate=${endDate}`;
    return this.fetch(url);
  }

  async getGstSalesRegister(storeId: string, params: { startDate?: string; endDate?: string; page?: number; pageSize?: number; all?: boolean; search?: string }) {
    let url = `/reports/gst/sales-register?storeId=${storeId}`;
    if (params.startDate) url += `&startDate=${params.startDate}`;
    if (params.endDate) url += `&endDate=${params.endDate}`;
    if (params.page) url += `&page=${params.page}`;
    if (params.pageSize) url += `&pageSize=${params.pageSize}`;
    if (params.all) url += `&all=true`;
    if (params.search) url += `&search=${encodeURIComponent(params.search)}`;
    return this.fetch(url);
  }

  // Support Tickets — store users raise tickets for their store
  async getSupportTickets(storeId: string) {
    return this.fetch(`/support/tickets?storeId=${storeId}`);
  }

  async createSupportTicket(data: {
    storeId: string;
    subject: string;
    category: string;
    priority: string;
    message: string;
  }) {
    return this.fetch('/support/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getSupportTicket(id: string) {
    return this.fetch(`/support/tickets/${id}`);
  }

  async replySupportTicket(id: string, message: string) {
    return this.fetch(`/support/tickets/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  // Support Tickets — superadmin inbox across all stores
  async getAllSupportTickets(status?: string) {
    let url = '/admin/support/tickets';
    if (status && status !== 'all') url += `?status=${status}`;
    return this.fetch(url);
  }

  async updateSupportTicketStatus(id: string, status: string) {
    return this.fetch(`/support/tickets/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
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

  // App version telemetry — the desktop app reports its running version per store
  async reportAppVersion(version: string, storeId?: string) {
    return this.fetch('/auth/app-version', {
      method: 'POST',
      body: JSON.stringify({ version, storeId }),
    });
  }

  // Update Repository Configuration (superadmin only)
  async getUpdateRepoConfig() {
    return this.fetch('/system/update-config');
  }

  async updateUpdateRepoConfig(githubRepo: string) {
    return this.fetch('/system/update-config', {
      method: 'POST',
      body: JSON.stringify({ githubRepo }),
    });
  }

  // Gemini Configuration (superadmin only)
  async getGeminiConfig() {
    return this.fetch('/system/gemini-config');
  }

  async updateGeminiConfig(config: { apiKey: string; model?: string }) {
    return this.fetch('/system/gemini-config', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  async listGeminiModels() {
    return this.fetch('/system/gemini-models');
  }

  // Cashfree Payment Configuration (superadmin only)
  async getCashfreeConfig() {
    return this.fetch('/system/cashfree-config');
  }

  async updateCashfreeConfig(config: {
    enabled: boolean;
    appId: string;
    secretKey: string;
    env: string;
    returnUrl: string;
    notifyUrl: string;
  }) {
    return this.fetch('/system/cashfree-config', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  // Whether online plan payment is available (any authenticated user)
  async getPaymentConfig() {
    return this.fetch('/subscriptions/my/payment-config');
  }

  // AI Menu Parsing (superadmin only)
  // Supports either a single image (legacy) or multiple images in one request.
  async parseMenuImage(storeId: string, imageBase64: string, mimeType: string) {
    return this.fetch('/menu/parse', {
      method: 'POST',
      body: JSON.stringify({ storeId, imageBase64, mimeType }),
    });
  }

  async parseMenuImages(storeId: string, images: { imageBase64: string; mimeType: string }[]) {
    return this.fetch('/menu/parse', {
      method: 'POST',
      body: JSON.stringify({ storeId, images }),
    });
  }

  // mode: 'add' | 'replace' | 'merge'
  async bulkCreateMenu(storeId: string, categories: any[], replaceExisting: boolean, mode?: 'add' | 'replace' | 'merge') {
    return this.fetch('/menu/bulk', {
      method: 'POST',
      body: JSON.stringify({ storeId, categories, replaceExisting, mode }),
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

  // Expense Reports (server-side paginated)
  async getExpenseCategoryReport(storeId: string, params: {
    startDate?: string;
    endDate?: string;
    search?: string;
    sort?: string;
    dir?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
    all?: boolean;
  } = {}) {
    const qs = new URLSearchParams({ storeId });
    if (params.startDate) qs.set('startDate', params.startDate);
    if (params.endDate) qs.set('endDate', params.endDate);
    if (params.search) qs.set('search', params.search);
    if (params.sort) qs.set('sort', params.sort);
    if (params.dir) qs.set('dir', params.dir);
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.all) qs.set('all', 'true');
    return this.fetch(`/reports/expenses-by-category?${qs.toString()}`);
  }

  async getExpenseDateReport(storeId: string, params: {
    startDate?: string;
    endDate?: string;
    sort?: string;
    dir?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
    all?: boolean;
  } = {}) {
    const qs = new URLSearchParams({ storeId });
    if (params.startDate) qs.set('startDate', params.startDate);
    if (params.endDate) qs.set('endDate', params.endDate);
    if (params.sort) qs.set('sort', params.sort);
    if (params.dir) qs.set('dir', params.dir);
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.all) qs.set('all', 'true');
    return this.fetch(`/reports/expenses-by-date?${qs.toString()}`);
  }

  // Raw Materials (store-scoped inventory)
  async getRawMaterials(storeId: string) {
    return this.fetch(`/raw-materials?storeId=${storeId}`);
  }

  async createRawMaterial(material: any) {
    return this.fetch('/raw-materials', {
      method: 'POST',
      body: JSON.stringify(material),
    });
  }

  async updateRawMaterial(id: string, material: any) {
    return this.fetch(`/raw-materials/${id}`, {
      method: 'PUT',
      body: JSON.stringify(material),
    });
  }

  async deleteRawMaterial(id: string) {
    return this.fetch(`/raw-materials/${id}`, {
      method: 'DELETE',
    });
  }

  // Raw Material Purchases
  async getRawMaterialPurchases(storeId: string, params: {
    materialId?: string;
    startDate?: string;
    endDate?: string;
  } = {}) {
    const qs = new URLSearchParams({ storeId });
    if (params.materialId) qs.set('materialId', params.materialId);
    if (params.startDate) qs.set('startDate', params.startDate);
    if (params.endDate) qs.set('endDate', params.endDate);
    return this.fetch(`/raw-material-purchases?${qs.toString()}`);
  }

  async createRawMaterialPurchase(purchase: any) {
    return this.fetch('/raw-material-purchases', {
      method: 'POST',
      body: JSON.stringify(purchase),
    });
  }

  async updateRawMaterialPurchase(id: string, purchase: any) {
    return this.fetch(`/raw-material-purchases/${id}`, {
      method: 'PUT',
      body: JSON.stringify(purchase),
    });
  }

  async deleteRawMaterialPurchase(id: string) {
    return this.fetch(`/raw-material-purchases/${id}`, {
      method: 'DELETE',
    });
  }

  async getRawMaterialPurchaseReport(storeId: string, startDate?: string, endDate?: string) {
    let url = `/raw-material-purchases/report?storeId=${storeId}`;
    if (startDate) url += `&startDate=${startDate}`;
    if (endDate) url += `&endDate=${endDate}`;
    return this.fetch(url);
  }

  // Raw Material Stock Transactions
  async getRawMaterialTransactions(storeId: string, params: {
    materialId?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const qs = new URLSearchParams({ storeId });
    if (params.materialId) qs.set('materialId', params.materialId);
    if (params.type) qs.set('type', params.type);
    if (params.startDate) qs.set('startDate', params.startDate);
    if (params.endDate) qs.set('endDate', params.endDate);
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    return this.fetch(`/raw-material-transactions?${qs.toString()}`);
  }

  async createRawMaterialTransaction(txn: any) {
    return this.fetch('/raw-material-transactions', {
      method: 'POST',
      body: JSON.stringify(txn),
    });
  }

  async deleteRawMaterialTransaction(id: string) {
    return this.fetch(`/raw-material-transactions/${id}`, {
      method: 'DELETE',
    });
  }

  // Item Recipes — raw materials required per menu item (bulk replace)
  async getItemRecipe(itemId: string) {
    return this.fetch(`/items/${itemId}/recipe`);
  }

  async setItemRecipe(itemId: string, storeId: string, lines: { materialId: string; quantity: number }[]) {
    return this.fetch(`/items/${itemId}/recipe`, {
      method: 'PUT',
      body: JSON.stringify({ storeId, lines }),
    });
  }

  async getRawMaterialConsumptionReport(storeId: string, startDate?: string, endDate?: string) {
    let url = `/reports/raw-material-consumption?storeId=${storeId}`;
    if (startDate) url += `&startDate=${startDate}`;
    if (endDate) url += `&endDate=${endDate}`;
    return this.fetch(url);
  }

  // Revenue Report
  async getRevenueReport(storeId: string, startDate?: string, endDate?: string, summaryOnly?: boolean) {
    let url = `/reports/revenue?storeId=${storeId}`;
    if (startDate) url += `&startDate=${startDate}`;
    if (endDate) url += `&endDate=${endDate}`;
    if (summaryOnly) url += `&summaryOnly=true`;
    return this.fetch(url);
  }

  // Profit Report entries (server-side paginated)
  async getRevenueEntries(storeId: string, params: {
    startDate?: string;
    endDate?: string;
    search?: string;
    sort?: string;
    dir?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
    all?: boolean;
  } = {}) {
    const qs = new URLSearchParams({ storeId });
    if (params.startDate) qs.set('startDate', params.startDate);
    if (params.endDate) qs.set('endDate', params.endDate);
    if (params.search) qs.set('search', params.search);
    if (params.sort) qs.set('sort', params.sort);
    if (params.dir) qs.set('dir', params.dir);
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.all) qs.set('all', 'true');
    return this.fetch(`/reports/revenue-entries?${qs.toString()}`);
  }

  async getExpenseEntries(storeId: string, params: {
    startDate?: string;
    endDate?: string;
    search?: string;
    sort?: string;
    dir?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
    all?: boolean;
  } = {}) {
    const qs = new URLSearchParams({ storeId });
    if (params.startDate) qs.set('startDate', params.startDate);
    if (params.endDate) qs.set('endDate', params.endDate);
    if (params.search) qs.set('search', params.search);
    if (params.sort) qs.set('sort', params.sort);
    if (params.dir) qs.set('dir', params.dir);
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.all) qs.set('all', 'true');
    return this.fetch(`/reports/expense-entries?${qs.toString()}`);
  }

  // Top Selling Items Report (server-side paginated)
  async getTopSellingItems(storeId: string, params: {
    startDate?: string;
    endDate?: string;
    search?: string;
    sort?: string;
    dir?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
    all?: boolean;
  } = {}) {
    const qs = new URLSearchParams({ storeId });
    if (params.startDate) qs.set('startDate', params.startDate);
    if (params.endDate) qs.set('endDate', params.endDate);
    if (params.search) qs.set('search', params.search);
    if (params.sort) qs.set('sort', params.sort);
    if (params.dir) qs.set('dir', params.dir);
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.all) qs.set('all', 'true');
    return this.fetch(`/reports/top-selling-items?${qs.toString()}`);
  }

  // Top Selling Categories Report (server-side paginated)
  async getTopSellingCategories(storeId: string, params: {
    startDate?: string;
    endDate?: string;
    search?: string;
    sort?: string;
    dir?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
    all?: boolean;
  } = {}) {
    const qs = new URLSearchParams({ storeId });
    if (params.startDate) qs.set('startDate', params.startDate);
    if (params.endDate) qs.set('endDate', params.endDate);
    if (params.search) qs.set('search', params.search);
    if (params.sort) qs.set('sort', params.sort);
    if (params.dir) qs.set('dir', params.dir);
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.all) qs.set('all', 'true');
    return this.fetch(`/reports/top-selling-categories?${qs.toString()}`);
  }

  // Sales-Based Profit Report (server-side paginated)
  async getSalesProfitReport(storeId: string, params: {
    startDate?: string;
    endDate?: string;
    search?: string;
    sort?: string;
    dir?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
    all?: boolean;
  } = {}) {
    const qs = new URLSearchParams({ storeId });
    if (params.startDate) qs.set('startDate', params.startDate);
    if (params.endDate) qs.set('endDate', params.endDate);
    if (params.search) qs.set('search', params.search);
    if (params.sort) qs.set('sort', params.sort);
    if (params.dir) qs.set('dir', params.dir);
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.all) qs.set('all', 'true');
    return this.fetch(`/reports/sales-profit?${qs.toString()}`);
  }

  // Menu Item Profit Breakdown (server-side paginated)
  async getMenuProfitReport(storeId: string, params: {
    search?: string;
    sort?: string;
    dir?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
    all?: boolean;
  } = {}) {
    const qs = new URLSearchParams({ storeId });
    if (params.search) qs.set('search', params.search);
    if (params.sort) qs.set('sort', params.sort);
    if (params.dir) qs.set('dir', params.dir);
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.all) qs.set('all', 'true');
    return this.fetch(`/reports/menu-profit?${qs.toString()}`);
  }

  // Subscription Plans (superadmin only)
  async getSubscriptionPlans() {
    return this.fetch('/subscription-plans');
  }

  async createSubscriptionPlan(plan: {
    name: string;
    price: number;
    features?: string[];
    recurringType: string;
    isActive?: boolean;
  }) {
    return this.fetch('/subscription-plans', {
      method: 'POST',
      body: JSON.stringify(plan),
    });
  }

  async updateSubscriptionPlan(id: string, plan: {
    name: string;
    price: number;
    features?: string[];
    recurringType: string;
    isActive?: boolean;
  }) {
    return this.fetch(`/subscription-plans/${id}`, {
      method: 'PUT',
      body: JSON.stringify(plan),
    });
  }

  async deleteSubscriptionPlan(id: string) {
    return this.fetch(`/subscription-plans/${id}`, {
      method: 'DELETE',
    });
  }

  // My Plan — the caller's own store subscription (any authenticated role)
  async getMySubscription(storeId?: string) {
    let url = '/subscriptions/my';
    if (storeId) url += `?storeId=${storeId}`;
    return this.fetch(url);
  }

  async getMySubscriptionHistory(storeId?: string) {
    let url = '/subscriptions/my/history';
    if (storeId) url += `?storeId=${storeId}`;
    return this.fetch(url);
  }

  // My Plan — change requests (store users file them; superadmin approves)
  async submitSubscriptionRequest(storeId: string | undefined, data: { action: 'change_plan' | 'cancel'; planId?: string }) {
    return this.fetch('/subscriptions/my/requests', {
      method: 'POST',
      body: JSON.stringify({ storeId, ...data }),
    });
  }

  async withdrawSubscriptionRequest(requestId: string) {
    return this.fetch(`/subscriptions/my/requests/${requestId}/cancel`, {
      method: 'POST',
    });
  }

  // Subscription change requests (superadmin approval inbox)
  async getSubscriptionRequests(params: { storeId?: string; status?: string } = {}) {
    const qs = new URLSearchParams();
    if (params.storeId) qs.set('storeId', params.storeId);
    if (params.status && params.status !== 'all') qs.set('status', params.status);
    const query = qs.toString();
    return this.fetch(`/subscription-requests${query ? `?${query}` : ''}`);
  }

  async approveSubscriptionRequest(requestId: string) {
    return this.fetch(`/subscription-requests/${requestId}/approve`, {
      method: 'POST',
    });
  }

  async rejectSubscriptionRequest(requestId: string, note?: string) {
    return this.fetch(`/subscription-requests/${requestId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    });
  }

  // Store Subscriptions (superadmin only)
  async getSubscriptions(params: { storeId?: string; status?: string } = {}) {
    const qs = new URLSearchParams();
    if (params.storeId) qs.set('storeId', params.storeId);
    if (params.status && params.status !== 'all') qs.set('status', params.status);
    const query = qs.toString();
    return this.fetch(`/subscriptions${query ? `?${query}` : ''}`);
  }

  async createSubscription(data: {
    storeId: string;
    planId: string;
    startDate?: string;
    autoRenew?: boolean;
    showPrice?: boolean;
  }) {
    return this.fetch('/subscriptions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSubscription(id: string, data: { autoRenew?: boolean; showPrice?: boolean }) {
    return this.fetch(`/subscriptions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async cancelSubscription(id: string) {
    return this.fetch(`/subscriptions/${id}/cancel`, {
      method: 'POST',
    });
  }

  async renewSubscription(id: string) {
    return this.fetch(`/subscriptions/${id}/renew`, {
      method: 'POST',
    });
  }

  async changeSubscriptionPlan(id: string, data: {
    planId: string;
    startDate?: string;
    autoRenew?: boolean;
    showPrice?: boolean;
  }) {
    return this.fetch(`/subscriptions/${id}/change-plan`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Subscription payments (superadmin ledger + manual recording)
  async getSubscriptionPayments(params: { storeId?: string; subscriptionId?: string } = {}) {
    const qs = new URLSearchParams();
    if (params.storeId) qs.set('storeId', params.storeId);
    if (params.subscriptionId) qs.set('subscriptionId', params.subscriptionId);
    const query = qs.toString();
    return this.fetch(`/subscription-payments${query ? `?${query}` : ''}`);
  }

  async recordSubscriptionPayment(subscriptionId: string, data: {
    amount: number;
    method: string;
    notes?: string;
    renew?: boolean;
  }) {
    return this.fetch(`/subscriptions/${subscriptionId}/payments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getSubscriptionHistory(storeId?: string) {
    let url = '/subscriptions/history';
    if (storeId) url += `?storeId=${storeId}`;
    return this.fetch(url);
  }

  // My Plan — online payment (Cashfree checkout)
  async createPlanPaymentOrder(storeId: string | undefined, planId?: string) {
    return this.fetch('/subscriptions/my/pay', {
      method: 'POST',
      body: JSON.stringify({ storeId, planId }),
    });
  }

  async verifyPlanPayment(orderId: string) {
    return this.fetch(`/subscriptions/my/pay/${orderId}/verify`, {
      method: 'POST',
    });
  }

}

export const api = new ApiService();
