import React, { Suspense, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore, useDataStore } from './stores';
import UpdateNotification from './components/UpdateNotification';
import AppContextMenu from './components/AppContextMenu';
import OnScreenKeyboard from './components/OnScreenKeyboard';
import Login from './components/Login';
import Layout from './components/Layout';
import Tables from './components/Tables';
import SupportPage from './components/SupportPage';
import { api } from './services/api';
import { isQuietHours } from './utils/quietHours';
import { updaterService } from './services/updater';
import { remoteBillPrinter } from './services/remoteBillPrinter';

// Code-split secondary routes so the initial bundle (and app startup) stays
// small on low-end hardware. Only the POS core is loaded eagerly.
const Items = React.lazy(() => import('./components/Items'));
const History = React.lazy(() => import('./components/History'));
const Users = React.lazy(() => import('./components/Users'));
const Stores = React.lazy(() => import('./components/Stores'));
const BusinessSettings = React.lazy(() => import('./components/BusinessSettings'));
const SystemReset = React.lazy(() => import('./components/SystemReset'));
const UpdateManagement = React.lazy(() => import('./components/UpdateManagement'));
const SupportSettings = React.lazy(() => import('./components/SupportSettings'));
const SupportTickets = React.lazy(() => import('./components/SupportTickets'));
const Subscriptions = React.lazy(() => import('./components/Subscriptions'));
const MyPlan = React.lazy(() => import('./components/MyPlan'));
const DeveloperSettings = React.lazy(() => import('./components/DeveloperSettings'));
const MenuUpload = React.lazy(() => import('./components/MenuUpload'));
const Reports = React.lazy(() => import('./components/Reports'));
const ReportsIndex = React.lazy(() => import('./components/ReportsIndex'));
const TopSellingItemsReport = React.lazy(() => import('./components/TopSellingItemsReport'));
const TopSellingCategoriesReport = React.lazy(() => import('./components/TopSellingCategoriesReport'));
const OrderPage = React.lazy(() => import('./components/OrderPage'));
const ParcelOrderPage = React.lazy(() => import('./components/ParcelOrderPage'));
const Expenses = React.lazy(() => import('./components/Expenses'));
const ExpenseReports = React.lazy(() => import('./components/ExpenseReports'));
const Inventory = React.lazy(() => import('./components/Inventory'));
const RevenueReport = React.lazy(() => import('./components/RevenueReport'));
const ItemProfitReport = React.lazy(() => import('./components/ItemProfitReport'));
const GstReports = React.lazy(() => import('./components/GstReports'));
const RawMaterialConsumptionReportPage = React.lazy(() => import('./components/RawMaterialConsumptionReport'));

const routeFallback = (
  <div className="loading-container">
    <div className="spinner"></div>
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore();
  
  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }
  
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

const AppRoutes: React.FC = () => {
  const { isAuthenticated, isLoading, user, checkStoreActive, refreshUser, logout, validateToken } = useAuthStore();
  const initialize = useDataStore((state) => state.initialize);
  const stores = useDataStore((state) => state.stores);
  const currentStoreId = useAuthStore((state) => state.currentStoreId);
  const currentStore = stores.find(store => store.id === currentStoreId);
  const [isStoreActive, setIsStoreActive] = useState(true);

  // Validate token on app load to clear invalid persisted state
  useEffect(() => {
    if (api.getToken()) {
      validateToken();
    }
  }, [validateToken]);

  useEffect(() => {
    if (isAuthenticated && api.getToken()) {
      initialize();
    }
  }, [isAuthenticated, initialize]);

  // Report the running desktop app version for the active store (fire-and-forget;
  // no-ops in the browser and on older backends that lack the endpoint).
  // Re-reports hourly so "last seen" reflects a currently-running app.
  useEffect(() => {
    if (!isAuthenticated || !currentStoreId) return;
    updaterService.reportAppVersion(currentStoreId);
    const interval = setInterval(
      () => {
        if (!isQuietHours()) updaterService.reportAppVersion(currentStoreId);
      },
      3600000,
    );
    return () => clearInterval(interval);
  }, [isAuthenticated, currentStoreId]);

  useEffect(() => {
    if (isAuthenticated && user) {
      const active = checkStoreActive();
      setIsStoreActive(active);
    }
  }, [isAuthenticated, user, currentStoreId, checkStoreActive]);

  // Remote bill printing: active on every page when this device is the
  // store's designated bill printer; inert everywhere else. No cleanup
  // function on purpose — the service dedupes restarts internally so store
  // refreshes don't churn the websocket, and start(null) handles logout.
  useEffect(() => {
    remoteBillPrinter.start(isAuthenticated ? currentStore : null);
  }, [isAuthenticated, currentStore]);

  // Periodic store status check every 5 minutes - logout if store is disabled
  useEffect(() => {
    if (!isAuthenticated || !user || user.role === 'superadmin' || user.role === 'business_owner') return;

    const checkInterval = setInterval(async () => {
      if (isQuietHours()) return;
      await refreshUser();
      const active = checkStoreActive();
      if (!active) {
        // Store is disabled, logout user
        logout();
        window.location.hash = '/login';
      }
    }, 300000); // Check every 5 minutes

    return () => clearInterval(checkInterval);
  }, [isAuthenticated, user, checkStoreActive, refreshUser, logout]);

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  // If user is authenticated, not superadmin, and store is inactive, show support page
  if (isAuthenticated && user && user.role !== 'superadmin' && !isStoreActive) {
    return <SupportPage />;
  }

  return (
    <Suspense fallback={routeFallback}>
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" /> : <Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Tables />} />
        <Route path="order/:tableId" element={<OrderPage />} />
        <Route path="parcel-order" element={<ParcelOrderPage />} />
        <Route path="items" element={<Items />} />
        <Route path="history" element={<History />} />
        <Route path="users" element={<Users />} />
        <Route path="stores" element={<Stores />} />
        <Route path="subscriptions" element={<Subscriptions />} />
        <Route path="my-plan" element={<MyPlan />} />
        <Route path="business-settings" element={<BusinessSettings />} />
        <Route path="support-tickets" element={<SupportTickets />} />
        <Route path="support-settings" element={<SupportSettings />} />
        <Route path="developer-settings" element={<DeveloperSettings />} />
        <Route path="menu-upload" element={<MenuUpload />} />
        <Route path="system-reset" element={<SystemReset />} />
        <Route path="update-management" element={<UpdateManagement />} />
        <Route path="reports" element={<ReportsIndex />} />
        <Route path="reports/sales-analytics" element={<Reports />} />
        <Route path="reports/top-items" element={<TopSellingItemsReport />} />
        <Route path="reports/top-categories" element={<TopSellingCategoriesReport />} />
        <Route path="reports/revenue" element={<RevenueReport />} />
        <Route path="reports/item-profit" element={<ItemProfitReport />} />
        <Route path="reports/gst" element={<GstReports />} />
        <Route path="reports/raw-material-consumption" element={<RawMaterialConsumptionReportPage />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="expense-reports" element={<ExpenseReports />} />
        <Route path="inventory" element={<Inventory />} />
      </Route>
    </Routes>
    </Suspense>
  );
};

const App: React.FC = () => {
  return (
    <div className="app">
      <UpdateNotification />
      <AppContextMenu />
      <AppRoutes />
      <OnScreenKeyboard />
    </div>
  );
};

export default App;
