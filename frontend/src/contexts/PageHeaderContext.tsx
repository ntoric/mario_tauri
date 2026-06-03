import React, { createContext, useContext, useState, ReactNode } from 'react';

interface PageHeaderContent {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

interface PageHeaderContextType {
  headerContent: PageHeaderContent;
  setHeaderContent: (content: PageHeaderContent) => void;
}

const PageHeaderContext = createContext<PageHeaderContextType | undefined>(undefined);

export const PageHeaderProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [headerContent, setHeaderContent] = useState<PageHeaderContent>({
    title: '',
    subtitle: '',
    actions: null,
  });

  return (
    <PageHeaderContext.Provider value={{ headerContent, setHeaderContent }}>
      {children}
    </PageHeaderContext.Provider>
  );
};

export const usePageHeader = () => {
  const context = useContext(PageHeaderContext);
  if (!context) {
    throw new Error('usePageHeader must be used within a PageHeaderProvider');
  }
  return context;
};

export default PageHeaderContext;
