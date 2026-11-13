import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart2, ShoppingBag, Tag, TrendingUp, DollarSign, ArrowRight, PieChart , Boxes } from 'lucide-react';
import { usePageHeader } from '../contexts/PageHeaderContext';
import { useTaxEnabled } from '../hooks/useTaxEnabled';

interface ReportCard {
  title: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  color: string;
}

const ReportsIndex: React.FC = () => {
  const navigate = useNavigate();
  const { setHeaderContent } = usePageHeader();
  const taxEnabled = useTaxEnabled();

  useEffect(() => {
    setHeaderContent({
      title: 'Reports & Statistics',
      subtitle: 'View all business reports and analytics',
      actions: null,
    });
  }, [setHeaderContent]);

  const reportCards: ReportCard[] = [
    {
      title: 'Sales Analytics',
      description: 'Overview of revenue, orders, payment methods, and daily trends',
      icon: <BarChart2 size={24} />,
      path: '/reports/sales-analytics',
      color: 'var(--primary)',
    },
    {
      title: 'Top Selling Items',
      description: 'Detailed item-wise sales report with quantity and revenue data',
      icon: <ShoppingBag size={24} />,
      path: '/reports/top-items',
      color: 'var(--primary)',
    },
    {
      title: 'Top Selling Categories',
      description: 'Category-wise sales analysis with performance metrics',
      icon: <Tag size={24} />,
      path: '/reports/top-categories',
      color: 'var(--primary)',
    },
    {
      title: 'Profit Report',
      description: 'Combined sales, revenue, and expense analysis with profit tracking',
      icon: <DollarSign size={24} />,
      path: '/reports/revenue',
      color: 'var(--primary)',
    },
    {
      title: 'Item Profit Report',
      description: 'Per-item preparation costs, profit margins, and expense breakdown',
      icon: <PieChart size={24} />,
      path: '/reports/item-profit',
      color: 'var(--primary)',
    },
    {
      title: 'Expense Reports',
      description: 'Analyze business expenses by category and date',
      icon: <TrendingUp size={24} />,
      path: '/expense-reports',
      color: 'var(--primary)',
    },
    {
      title: 'GST Reports',
      description: 'GSTR-1, GSTR-3B summary, HSN summary, sales register',
      icon: <DollarSign size={24} />,
      path: '/reports/gst',
      color: 'var(--primary)',
    },
    {
      title: 'Raw Material Consumption',
      description: 'Raw materials consumed by completed orders — per material and per menu item',
      icon: <Boxes size={24} />,
      color: 'var(--primary)',
      path: '/reports/raw-material-consumption',
    },
  ];

  return (
    <div className="reports-index-page">
      <div className="reports-index-grid">
        {reportCards.filter(card => taxEnabled || card.path !== '/reports/gst').map((card) => (
          <div
            key={card.path}
            className="gr-card report-nav-card"
            onClick={() => navigate(card.path)}
          >
            <div className="gr-card__body" style={{ padding: '1.25rem', position: 'relative' }}>
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.9rem',
              }}>
                <div
                  className="report-nav-icon"
                  style={{
                    background: `linear-gradient(135deg, ${card.color} 0%, ${card.color} 55%, rgba(0,0,0,0.25) 160%)`,
                    backgroundColor: card.color,
                  }}
                >
                  {card.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 className="report-nav-title">
                    {card.title}
                  </h3>
                  <p className="report-nav-desc">
                    {card.description}
                  </p>
                </div>
              </div>
              <div className="report-nav-cta" style={{ color: card.color }}>
                View Report
                <ArrowRight size={15} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ReportsIndex;
