import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart2, ShoppingBag, Tag, TrendingUp, DollarSign, ArrowRight } from 'lucide-react';
import { usePageHeader } from '../contexts/PageHeaderContext';

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
      icon: <BarChart2 size={32} />,
      path: '/reports/sales-analytics',
      color: 'var(--primary)',
    },
    {
      title: 'Top Selling Items',
      description: 'Detailed item-wise sales report with quantity and revenue data',
      icon: <ShoppingBag size={32} />,
      path: '/reports/top-items',
      color: '#63b3ed',
    },
    {
      title: 'Top Selling Categories',
      description: 'Category-wise sales analysis with performance metrics',
      icon: <Tag size={32} />,
      path: '/reports/top-categories',
      color: '#b794f4',
    },
    {
      title: 'Profit Report',
      description: 'Combined sales, revenue, and expense analysis with profit tracking',
      icon: <DollarSign size={32} />,
      path: '/reports/revenue',
      color: '#ed8936',
    },
    {
      title: 'Expense Reports',
      description: 'Analyze business expenses by category and date',
      icon: <TrendingUp size={32} />,
      path: '/expense-reports',
      color: '#48bb78',
    },
  ];

  return (
    <div className="reports-index-page">
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '1.5rem',
        padding: '1rem 0'
      }}>
        {reportCards.map((card) => (
          <div
            key={card.path}
            className="card"
            onClick={() => navigate(card.path)}
            style={{
              cursor: 'pointer',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              position: 'relative',
              overflow: 'hidden'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
            }}
          >
            <div className="card-body" style={{ padding: '1.5rem' }}>
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '1rem',
                marginBottom: '1rem'
              }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '12px',
                  background: `${card.color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: card.color,
                  flexShrink: 0
                }}>
                  {card.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{
                    margin: '0 0 0.5rem 0',
                    fontSize: '1.25rem',
                    fontWeight: 600,
                    color: 'var(--gray-800)'
                  }}>
                    {card.title}
                  </h3>
                  <p style={{
                    margin: 0,
                    fontSize: '0.9rem',
                    color: 'var(--gray-600)',
                    lineHeight: 1.5
                  }}>
                    {card.description}
                  </p>
                </div>
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: card.color,
                fontWeight: 500,
                fontSize: '0.9rem',
                marginTop: '0.5rem'
              }}>
                View Report
                <ArrowRight size={16} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ReportsIndex;
