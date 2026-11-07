// Minimal typings for @cashfreepayments/cashfree-js (the package ships no d.ts).
declare module '@cashfreepayments/cashfree-js' {
  export interface CashfreeCheckoutOptions {
    paymentSessionId: string;
    redirectTarget?: '_self' | '_blank' | '_top' | '_modal' | HTMLElement;
    returnUrl?: string;
  }

  export interface CashfreeCheckoutResult {
    error?: { message?: string; code?: string };
    redirect?: boolean;
    paymentDetails?: { paymentMessage?: string };
  }

  export interface CashfreeInstance {
    checkout(options: CashfreeCheckoutOptions): Promise<CashfreeCheckoutResult>;
  }

  export function load(options: { mode: 'sandbox' | 'production' }): Promise<CashfreeInstance | null>;
}
