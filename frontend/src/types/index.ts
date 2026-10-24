export type UserRole = 'superadmin' | 'business_owner' | 'business_admin' | 'staff';

export interface User {
  id: string;
  username: string;
  name: string;
  email?: string;
  role: UserRole;
  storeId?: string;
  storeName?: string;
  stores?: Store[];
  isActive: boolean;
  createdAt?: string;
}

export interface Store {
  id: string;
  name: string;
  branch?: string;
  location?: string;
  gstin?: string;
  fssaiNo?: string;
  phone?: string;
  printerName?: string;
  printerVendorId?: string;
  printerProductId?: string;
  invoiceSize?: '2inch' | '3inch';
  kotPrintEnabled?: boolean;
  remoteBillingEnabled?: boolean;
  remotePrinterDeviceId?: string;
  logoUrl?: string;
  themeColor?: string;
  taxEnabled?: boolean;
  defaultTaxPercent?: number;
  isActive: boolean;
  appVersion?: string;
  appVersionSeenAt?: string;
  createdAt?: string;
}

export interface Category {
  id: string;
  storeId: string;
  name: string;
  description?: string;
  isActive: boolean;
  enabled?: boolean;
  isFavourite?: boolean;
  sortOrder?: number;
}

export interface Item {
  id: string;
  storeId: string;
  categoryId: string;
  categoryName?: string;
  name: string;
  description?: string;
  price: number;
  hsnCode?: string;
  taxPercent: number;
  isActive: boolean;
  enabled?: boolean;
  isFavourite?: boolean;
  totalCost?: number;
  profit?: number;
  profitPercent?: number;
}

export interface ItemExpense {
  id: string;
  storeId: string;
  itemId: string;
  name: string;
  description?: string;
  amount: number;
  isActive: boolean;
  createdAt?: string;
}

export interface ItemProfitEntry {
  item: Item;
  expenses: ItemExpense[];
  totalCost: number;
  profit: number;
  profitPercent: number;
}

export interface ItemProfitReport {
  storeId: string;
  items: ItemProfitEntry[];
  totalSellingValue: number;
  totalCost: number;
  totalProfit: number;
  averageProfitPercent: number;
  itemsWithCostCount: number;
}

export interface Table {
  id: string;
  storeId: string;
  number: number;
  name?: string;
  seats: number;
  position: { x: number; y: number };
  isActive: boolean;
  section?: string;
}

export interface TableSection {
  id: string;
  storeId: string;
  name: string;
  isDefault?: boolean;
  createdAt: string;
}

export interface OrderItem {
  itemId: string;
  item: Item;
  quantity: number;
  unitPrice?: number;
  taxPercent?: number;
  notes?: string;
}

export type OrderStatus = 'active' | 'completed' | 'cancelled' | 'merged';
export type OrderType = 'dine_in' | 'parcel';

export interface Order {
  id: string;
  storeId: string;
  tableId: string;
  tableNumber: number;
  tableName?: string;
  items: OrderItem[];
  status: OrderStatus;
  orderType?: OrderType;
  customerName?: string;
  customerMobile?: string;
  totalAmount: number;
  taxAmount: number;
  discountAmount: number;
  paymentMethod?: string;
  paymentStatus?: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
  createdBy: string;
}

export interface Bill {
  id: string;
  storeId: string;
  orderId: string;
  tableNumber: number;
  tableName?: string;
  invoiceNo?: string;
  items: OrderItem[];
  subtotal: number;
  taxTotal: number;
  discount: number;
  total: number;
  paymentMethod?: string;
  customerName?: string;
  customerMobile?: string;
  isPrinted: boolean;
  status?: string;
  generatedAt: string;
  generatedBy: string;
}

export interface BillQueueItem {
  id: string;
  storeId: string;
  orderId: string;
  billData: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseCategory {
  id: string;
  storeId: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt?: string;
}

export interface Expense {
  id: string;
  storeId: string;
  categoryId: string;
  categoryName?: string;
  title: string;
  description?: string;
  amount: number;
  expenseDate: string;
  paymentMethod?: string;
  receiptNumber?: string;
  vendor?: string;
  attachments?: string[];
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  createdBy: string;
}

export interface ExpenseReport {
  categoryId: string;
  categoryName: string;
  totalAmount: number;
  expenseCount: number;
}

export interface ExpenseSummary {
  date: string;
  totalAmount: number;
  expenseCount: number;
}

export interface ExpenseCategoryReportResult {
  rows: ExpenseReport[];
  total: number;
  page: number;
  pageSize: number;
  totalAmount: number;
  totalCount: number;
  chartRows: ExpenseReport[];
}

export interface ExpenseDateReportResult {
  rows: ExpenseSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalAmount: number;
  totalCount: number;
  chartRows: ExpenseSummary[];
}

export interface RevenueEntriesResult {
  rows: Bill[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ExpenseEntriesResult {
  rows: Expense[];
  total: number;
  page: number;
  pageSize: number;
}

export type SupportTicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type SupportTicketCategory = 'general' | 'bug' | 'billing' | 'feature' | 'account' | 'other';
export type SupportTicketPriority = 'low' | 'medium' | 'high';

export interface SupportTicket {
  id: string;
  storeId: string;
  storeName?: string;
  storeBranch?: string;
  storePhone?: string;
  storeLocation?: string;
  createdBy: string;
  createdByName?: string;
  subject: string;
  category: string;
  priority: string;
  status: SupportTicketStatus;
  messageCount: number;
  lastMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  senderId: string;
  senderName?: string;
  senderRole: string;
  message: string;
  createdAt: string;
}

export interface RevenueReport {
  periodStart: string;
  periodEnd: string;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalOrders: number;
  totalBills: number;
  totalExpenseCount: number;
  averageOrderValue: number;
  bills: Bill[];
  expenses: Expense[];
}
