import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart2 } from 'lucide-react';
import { usePageHeader } from '../contexts/PageHeaderContext';

interface ReportPageHeaderOptions {
  title: string;
  subtitle?: string;
  backTo?: string;
  backLabel?: string;
  extraActions?: ReactNode;
  showStats?: boolean;
  onToggleStats?: () => void;
}

export function useReportPageHeader({
  title,
  subtitle,
  backTo = '/reports',
  backLabel = 'Back to Reports',
  extraActions,
  showStats,
  onToggleStats,
}: ReportPageHeaderOptions) {
  const { setHeaderContent } = usePageHeader();
  const navigate = useNavigate();

  useEffect(() => {
    setHeaderContent({
      title,
      subtitle,
      actions: (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(backTo)}>
            <ArrowLeft size={16} />
            {backLabel}
          </button>
          {onToggleStats && (
            <button
              type="button"
              className={`btn ${showStats ? 'btn-primary' : 'btn-secondary'}`}
              onClick={onToggleStats}
            >
              <BarChart2 size={14} />
              {showStats ? 'Hide Stats' : 'Show Stats'}
            </button>
          )}
          {extraActions}
        </div>
      ),
    });
  }, [title, subtitle, backTo, backLabel, extraActions, showStats, onToggleStats, setHeaderContent, navigate]);
}
