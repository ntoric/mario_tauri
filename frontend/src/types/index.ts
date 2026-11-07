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
  secondaryPhone?: string;
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
  gstRegistrationType?: 'regular' | 'composition' | 'unregistered';
  stateCode?: string;
  pricesIncludeTax?: boolean;
  invoicePrefix?: string;
  creditNotePrefix?: string;
  defaultSacCode?: string;
  swiggyGstin?: string;
  zomatoGstin?: string;
  otherEcoGstin?: string;
  /** Hide orders/bills/reports/expenses older than this many days from
   *  store users (superadmin keeps full history). 0 = unlimited. */
  dataRetentionDays?: number;
  /** Show the "My Plan" subscription page to this store's users
   *  (superadmin always sees it). Superadmin-only setting. */
  myPlanEnabled?: boolean;
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
  taxCategory?: string;
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
  orderSource?: string;
  /** Present on responses that also issue a bill (save-ebill, parcel). */
  bill?: Bill;
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
  fy?: string;
  invoiceSeq?: number;
  documentType?: string;
  supplyType?: string;
  placeOfSupply?: string;
  placeOfSupplyName?: string;
  supplierGstin?: string;
  supplierStateCode?: string;
  buyerGstin?: string;
  buyerName?: string;
  buyerAddress?: string;
  buyerStateCode?: string;
  orderSource?: string;
  pricesIncludeTax?: boolean;
  taxableValue?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  cess?: number;
  roundOff?: number;
  isUtgst?: boolean;
  cancelledAt?: string;
  cancelReason?: string;
  creditedTotal?: number;
  lines?: BillLine[];
  taxSummary?: TaxSummaryRow[];
}

export interface BillLine {
  id: number;
  billId: string;
  itemId?: string;
  name: string;
  hsnCode?: string;
  unit?: string;
  taxCategory?: string;
  quantity: number;
  unitPrice: number;
  gross: number;
  discount: number;
  taxableValue: number;
  taxRate: number;
  cgstRate: number;
  cgst: number;
  sgstRate: number;
  sgst: number;
  igstRate: number;
  igst: number;
  cess: number;
  total: number;
  creditedQuantity?: number;
}

export interface TaxSummaryRow {
  rate: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
}

export interface CreditNoteLine {
  id: number;
  creditNoteId: string;
  billLineId: number;
  itemId?: string;
  name: string;
  hsnCode?: string;
  unit?: string;
  quantity: number;
  taxableValue: number;
  taxRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  total: number;
}

export interface CreditNote {
  id: string;
  storeId: string;
  billId: string;
  creditNoteNo: string;
  fy?: string;
  seq?: number;
  reason: string;
  supplyType?: string;
  placeOfSupply?: string;
  buyerGstin?: string;
  isUtgst?: boolean;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  roundOff: number;
  total: number;
  status: string;
  issuedAt: string;
  issuedBy?: string;
  originalInvoiceNo?: string;
  originalInvoiceDate?: string;
  lines: CreditNoteLine[];
}

export interface GstMeta {
  states: { code: string; name: string; utgst: boolean }[];
  rates: number[];
  taxCategories: string[];
  registrationTypes: string[];
  orderSources: { id: string; label: string }[];
}

export interface GstPreview {
  lines: BillLine[];
  taxSummary: TaxSummaryRow[];
  gross: number;
  discount: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  totalTax: number;
  roundOff: number;
  total: number;
  chargesTax: boolean;
  interState: boolean;
  utgst: boolean;
  placeOfSupply: string;
  supplyType: string;
  documentType: string;
}

export interface GstSummaryReport {
  registrationType: string;
  legacyBillsExcluded: number;
  invoices: {
    count: number; cancelledCount: number; taxableValue: number;
    cgst: number; sgst: number; igst: number; cess: number;
    totalTax: number; invoiceValue: number;
  };
  creditNotes: {
    count: number; taxableValue: number; cgst: number; sgst: number;
    igst: number; cess: number; total: number;
  };
  net: { taxableValue: number; cgst: number; sgst: number; igst: number; cess: number; totalTax: number };
  rateWise: { rate: number; b2bTaxable?: number; b2cTaxable?: number; taxableValue: number; igst: number; cgst: number; sgst: number; cess: number }[];
  gstr3b: {
    outwardTaxable: { taxableValue: number; igst: number; cgst: number; sgst: number; cess: number };
    nilExempt: { taxableValue: number };
    nonGst: { taxableValue: number };
    ecoSupplies: { taxableValue: number };
  };
  composition?: { turnover: number; cgst: number; sgst: number; total: number };
}

export interface Gstr1Report {
  gstin: string;
  period: { from?: string; to?: string };
  legacyBillsExcluded: number;
  b2b: any[] | null;
  b2cl: any[] | null;
  b2cs: any[] | null;
  cdnr: any[] | null;
  cdnur: any[] | null;
  hsnB2b: any[] | null;
  hsnB2c: any[] | null;
  docs: any[] | null;
  eco: any[] | null;
}

export interface GstSalesRegisterResult {
  rows: any[];
  total: number;
  page: number;
  pageSize: number;
  legacyBillsExcluded: number;
  totals: {
    taxableValue: number; cgst: number; sgst: number; igst: number;
    cess: number; roundOff: number; total: number; totalTax: number;
  };
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

export type RecurringType = 'monthly' | 'quarterly' | 'biannually' | 'yearly';

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  features: string[];
  recurringType: RecurringType;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'replaced';

export interface StoreSubscription {
  id: string;
  storeId: string;
  storeName?: string;
  storeBranch?: string;
  planId: string;
  planName: string;
  planPrice: number;
  recurringType: RecurringType;
  status: SubscriptionStatus;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  showPrice?: boolean;
  renewalCount: number;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type ChangeRequestType = 'upgrade' | 'downgrade' | 'plan_change' | 'cancel';
export type ChangeRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'applied';

export interface SubscriptionChangeRequest {
  id: string;
  storeId: string;
  storeName?: string;
  storeBranch?: string;
  subscriptionId: string;
  type: ChangeRequestType;
  currentPlanName?: string;
  requestedPlanId?: string;
  requestedPlanName?: string;
  requestedPlanPrice: number;
  requestedRecurringType?: RecurringType;
  effectiveDate?: string;
  status: ChangeRequestStatus;
  note?: string;
  requestedBy: string;
  requestedByName?: string;
  createdAt: string;
  resolvedBy?: string;
  resolvedByName?: string;
  resolvedAt?: string;
}

export interface MySubscription {
  subscription: StoreSubscription | null;
  plan?: SubscriptionPlan | null;
  pendingRequest?: SubscriptionChangeRequest | null;
}

export interface SubscriptionPayment {
  id: string;
  storeId: string;
  storeName?: string;
  storeBranch?: string;
  subscriptionId: string;
  planName?: string;
  amount: number;
  method: string;
  status: 'paid' | 'pending' | 'failed' | 'refunded';
  periodStart?: string;
  periodEnd?: string;
  paidAt: string;
  recordedBy?: string;
  recordedByName?: string;
  notes?: string;
  createdAt: string;
}

export interface MySubscriptionHistory {
  periods: StoreSubscription[];
  events: SubscriptionEvent[];
  payments: SubscriptionPayment[];
}

export interface SubscriptionEvent {
  id: number;
  storeId: string;
  storeName?: string;
  subscriptionId: string;
  action: string;
  fromPlanId?: string;
  fromPlanName?: string;
  toPlanId?: string;
  toPlanName?: string;
  notes?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt: string;
}

export interface RawMaterial {
  id: string;
  storeId: string;
  name: string;
  unit: string;
  description?: string;
  currentStock: number;
  minStock: number;
  avgCost?: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  createdBy: string;
}

export interface RawMaterialPurchase {
  id: string;
  storeId: string;
  materialId: string;
  materialName?: string;
  materialUnit?: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  remainingQty?: number;
  expiryDate?: string;
  vendor?: string;
  invoiceNumber?: string;
  purchaseDate: string;
  paymentMethod?: string;
  notes?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  createdBy: string;
}

export type RawMaterialTransactionType = 'purchase' | 'usage' | 'wastage' | 'adjustment' | 'consumption';

export interface RawMaterialTransaction {
  id: string;
  storeId: string;
  materialId: string;
  materialName?: string;
  materialUnit?: string;
  type: RawMaterialTransactionType;
  quantity: number;
  stockAfter: number;
  referenceId?: string;
  itemId?: string;
  itemName?: string;
  unitCost?: number;
  notes?: string;
  transactionDate: string;
  isActive: boolean;
  createdAt?: string;
  createdBy: string;
}

export interface RawMaterialPurchaseReport {
  totalCost: number;
  totalCount: number;
  byMaterial: {
    materialId: string;
    materialName: string;
    materialUnit: string;
    quantity: number;
    totalCost: number;
    purchaseCount: number;
  }[];
  byDate: {
    date: string;
    totalCost: number;
    purchaseCount: number;
  }[];
}

export interface ItemRecipeLine {
  id: string;
  storeId: string;
  itemId: string;
  materialId: string;
  materialName?: string;
  materialUnit?: string;
  materialAvgCost?: number;
  quantity: number;
  lineCost?: number;
  isActive: boolean;
}

export interface RawMaterialConsumptionReport {
  totalCost: number;
  totalCount: number;
  byMaterial: {
    materialId: string;
    materialName: string;
    materialUnit: string;
    quantity: number;
    totalCost: number;
    txnCount: number;
  }[];
  byItem: {
    itemId: string;
    itemName: string;
    totalCost: number;
    txnCount: number;
  }[];
}

export interface PaymentOrder {
  id: string;
  gateway: string;
  storeId: string;
  storeName?: string;
  subscriptionId?: string;
  planId?: string;
  planName: string;
  planPrice: number;
  recurringType: RecurringType;
  amount: number;
  currency: string;
  status: 'created' | 'paid' | 'failed' | 'expired';
  paymentSessionId?: string;
  cfPaymentId?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePaymentOrderResponse {
  order: PaymentOrder;
  paymentSessionId: string;
  mode: 'sandbox' | 'production';
}

export type VerifyPaymentStatus = 'pending' | 'paid' | 'failed' | 'expired';

export interface VerifyPaymentOrderResponse {
  status: VerifyPaymentStatus;
  order: PaymentOrder;
  subscription?: StoreSubscription | null;
  payment?: SubscriptionPayment | null;
}
