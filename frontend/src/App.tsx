import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore, useDataStore } from './stores';
import UpdateNotification from './components/UpdateNotification';
import Login from './components/Login';
import Layout from './components/Layout';
import Tables from './components/Tables';
import Items from './components/Items';
import History from './components/History';
import Users from './components/Users';
import Stores from './components/Stores';
import BusinessSettings from './components/BusinessSettings';
import SystemReset from './components/SystemReset';
import UpdateManagement from './components/UpdateManagement';
import SupportSettings from './components/SupportSettings';
import DeveloperSettings from './components/DeveloperSettings';
import MenuUpload from './components/MenuUpload';
import SupportPage from './components/SupportPage';
import Reports from './components/Reports';
import ReportsIndex from './components/ReportsIndex';
import TopSellingItemsReport from './components/TopSellingItemsReport';
import TopSellingCategoriesReport from './components/TopSellingCategoriesReport';
import OrderPage from './components/OrderPage';
import ParcelOrderPage from './components/ParcelOrderPage';
import Expenses from './components/Expenses';
import ExpenseReports from './components/ExpenseReports';
import RevenueReport from './components/RevenueReport';
import ItemProfitReport from './components/ItemProfitReport';
import { api } from './services/api';

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

  useEffect(() => {
    if (isAuthenticated && user) {
      const active = checkStoreActive();
      setIsStoreActive(active);
    }
  }, [isAuthenticated, user, currentStoreId, checkStoreActive]);

  // Periodic store status check every 5 minutes - logout if store is disabled
  useEffect(() => {
    if (!isAuthenticated || !user || user.role === 'superadmin' || user.role === 'business_owner') return;

    const checkInterval = setInterval(async () => {
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
        <Route path="business-settings" element={<BusinessSettings />} />
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
        <Route path="expenses" element={<Expenses />} />
        <Route path="expense-reports" element={<ExpenseReports />} />
      </Route>
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <div className="app">
      <UpdateNotification />
      <AppRoutes />
    </div>
  );
};

export default App;
