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
  logoUrl?: string;
  themeColor?: string;
  isActive: boolean;
  createdAt?: string;
}

export interface Category {
  id: string;
  storeId: string;
  name: string;
  description?: string;
  isActive: boolean;
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
}

export interface Table {
  id: string;
  storeId: string;
  number: number;
  seats: number;
  position: { x: number; y: number };
  isActive: boolean;
}

export interface OrderItem {
  itemId: string;
  item: Item;
  quantity: number;
  unitPrice?: number;
  taxPercent?: number;
  notes?: string;
}

export type OrderStatus = 'active' | 'completed' | 'cancelled';
export type OrderType = 'dine_in' | 'parcel';

export interface Order {
  id: string;
  storeId: string;
  tableId: string;
  tableNumber: number;
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
  createdBy: string;
}

export interface Bill {
  id: string;
  storeId: string;
  orderId: string;
  tableNumber: number;
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
  dailyBreakdown?: DailyRevenueBreakdown[];
}

export interface DailyRevenueBreakdown {
  date: string;
  revenue: number;
  expenses: number;
  netProfit: number;
  orderCount: number;
  billCount: number;
  expenseCount: number;
}
