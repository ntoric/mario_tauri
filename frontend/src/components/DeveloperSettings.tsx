import React, { useState, useEffect } from 'react';
import { Building2, MessageCircle, AlertTriangle, Wrench, Mail } from 'lucide-react';
import { useAuthStore } from '../stores';
import { usePageHeader } from '../contexts/PageHeaderContext';
import Stores from './Stores';
import SupportSettings from './SupportSettings';
import SystemReset from './SystemReset';
import SmtpSettings from './SmtpSettings';

type DevTab = 'stores' | 'support' | 'smtp' | 'reset';

const DeveloperSettings: React.FC = () => {
  const { user } = useAuthStore();
  const { setHeaderContent } = usePageHeader();
  const [activeTab, setActiveTab] = useState<DevTab>('stores');

  useEffect(() => {
    setHeaderContent({
      title: 'Developer Settings',
      subtitle: 'Manage stores, support configuration, and system resets',
      actions: null,
    });
  }, [setHeaderContent]);

  if (user?.role !== 'superadmin') {
    return (
      <div className="empty-state">
        <Wrench size={48} />
        <p>Access denied</p>
        <p style={{ fontSize: '0.875rem' }}>Superadmin role required to view this page.</p>
      </div>
    );
  }

  const tabs: { id: DevTab; label: string; icon: React.FC<any> }[] = [
    { id: 'stores', label: 'Manage Stores', icon: Building2 },
    { id: 'support', label: 'Support Settings', icon: MessageCircle },
    { id: 'smtp', label: 'SMTP Settings', icon: Mail },
    { id: 'reset', label: 'System Reset', icon: AlertTriangle },
  ];

  return (
    <div>
      <div className="tabs">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'stores' && <Stores />}
      {activeTab === 'support' && <SupportSettings />}
      {activeTab === 'smtp' && <SmtpSettings />}
      {activeTab === 'reset' && <SystemReset />}
    </div>
  );
};

export default DeveloperSettings;
