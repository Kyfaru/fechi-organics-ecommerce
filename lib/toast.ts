import { createElement } from 'react';
import { toast as sonnerToast } from 'sonner';
import { CriticalToast } from '@/components/admin/CriticalToast';

type Position =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

interface ToastOptions {
  message?: string;
  duration?: number;
  position?: Position;
}

/**
 * Lightweight convenience wrapper around sonner.
 * Usage:
 *   toast.success('Added to cart')
 *   toast.error('Payment failed')
 *   toast.warning('Session expiring soon')
 *   toast.info('New version available')
 *
 * To pass a secondary message line:
 *   toast.success('Welcome back!', { message: 'Redirecting to your dashboard…' })
 */
export const toast = {
  success(title: string, options?: ToastOptions) {
    sonnerToast.success(title, {
      description: options?.message,
      duration: options?.duration ?? 4000,
      position: options?.position ?? 'bottom-right',
    });
  },

  error(title: string, options?: ToastOptions) {
    sonnerToast.error(title, {
      description: options?.message,
      duration: options?.duration ?? 5000,
      position: options?.position ?? 'bottom-right',
    });
  },

  warning(title: string, options?: ToastOptions) {
    sonnerToast.warning(title, {
      description: options?.message,
      duration: options?.duration ?? 4500,
      position: options?.position ?? 'bottom-right',
    });
  },

  info(title: string, options?: ToastOptions) {
    sonnerToast.info(title, {
      description: options?.message,
      duration: options?.duration ?? 4000,
      position: options?.position ?? 'bottom-right',
    });
  },

  /**
   * The one intentional style break from the rest of this wrapper — white
   * background, black text, red warning icon, bottom timer bar, an optional
   * "Details" deep-link. Reserved for CRITICAL-severity admin notifications
   * (failed payments, system alerts) surfaced while an admin is logged in.
   */
  critical(title: string, options?: { message?: string; actionUrl?: string; duration?: number }) {
    const duration = options?.duration ?? 8000;
    sonnerToast.custom(
      (id) =>
        createElement(CriticalToast, {
          id,
          title,
          message: options?.message,
          actionUrl: options?.actionUrl,
          duration,
        }),
      { duration, position: 'top-right' }
    );
  },
};
