import toast, { ToastOptions } from 'react-hot-toast';

/**
 * Central toast helper. Renders through <GlassToaster /> (see components/ui/GlassToaster).
 *
 * Usage:
 *   notify.success('Settings saved');
 *   notify.error('Failed to delete item');
 *   notify.warning('No data to export');
 *   notify.info('Update available');
 *   const id = notify.loading('Saving...');
 *   notify.success('Saved', { id });
 */
export const notify = {
  success: (message: string, options?: ToastOptions) =>
    toast.success(message, { duration: 3000, ...options }),

  error: (message: string, options?: ToastOptions) =>
    toast.error(message, { duration: 5000, ...options }),

  warning: (message: string, options?: ToastOptions) =>
    toast(message, { duration: 4000, ...options, className: 'glass-toast--warning' }),

  info: (message: string, options?: ToastOptions) =>
    toast(message, { duration: 4000, ...options, className: 'glass-toast--info' }),

  loading: (message: string, options?: ToastOptions) =>
    toast.loading(message, options),

  promise: toast.promise,
  dismiss: toast.dismiss,
};

export default notify;
