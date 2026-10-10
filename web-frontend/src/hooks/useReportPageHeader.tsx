import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePageHeader } from '../contexts/PageHeaderContext';

interface ReportPageHeaderOptions {
  title: string;
  subtitle?: string;
  backTo?: string;
  backLabel?: string;
  extraActions?: ReactNode;
}

export function useReportPageHeader({
  title,
  subtitle,
  backTo = '/reports',
  backLabel = 'Back to Reports',
  extraActions,
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
          {extraActions}
        </div>
      ),
    });
  }, [title, subtitle, backTo, backLabel, extraActions, setHeaderContent, navigate]);
}
