/**
 * HunarLink Razorpay Standard Checkout Browser Adapter.
 *
 * Uses `apiClient.js` so calls work cleanly through:
 *   - Vite dev/preview proxy (`/api/v1/...` -> FastAPI `:8000`)
 *   - Production `VITE_API_BASE_URL` (e.g. `https://api.hunarlink.example`)
 *
 * Security & Honesty Rules:
 *  - NEVER stores or reads RAZORPAY_KEY_SECRET or RAZORPAY_WEBHOOK_SECRET.
 *  - NEVER treats browser cart totals as authoritative; FastAPI recalculates
 *    the exact INR total in Decimal -> integer paise from MySQL line items.
 *  - NEVER marks an order paid in browser state before FastAPI verifies the
 *    HMAC-SHA256 signature and Razorpay payment capture status.
 */

import { apiRequest, canAttemptBackend, createRetailOrder, resolveApiBase } from './apiClient.js';

const CHECKOUT_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

export function getApiBaseUrl() {
  return resolveApiBase() ?? '';
}

export function isBackendConfigured() {
  return canAttemptBackend();
}

export function loadRazorpayScript() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Razorpay Checkout requires a browser environment.'));
  }
  if (window.Razorpay) {
    return Promise.resolve(window.Razorpay);
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${CHECKOUT_SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Razorpay), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Failed to load Razorpay Checkout script.')),
        { once: true }
      );
      return;
    }
    const script = document.createElement('script');
    script.src = CHECKOUT_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => reject(new Error('Failed to load Razorpay Checkout script.'));
    document.head.appendChild(script);
  });
}

export function generateIdempotencyKey(prefix = 'hl') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * End-to-end server-authoritative Retail Checkout:
 *   1. POST /api/v1/orders/retail (server calculates Decimal total from DB listings)
 *   2. If COD -> returns confirmed COD order directly (never creates a Razorpay order)
 *   3. If Online -> POST /api/v1/payments/razorpay/create-order -> Razorpay Modal ->
 *      POST /api/v1/payments/razorpay/verify
 */
export async function executeServerRetailCheckout({
  items,
  shippingAddress,
  paymentMethod = 'RAZORPAY_STANDARD',
  authToken,
  buyer = {}
}) {
  if (!authToken) {
    throw new Error('Sign in with Clerk to complete server-verified checkout.');
  }

  const order = await createRetailOrder(
    {
      items,
      shipping_address: shippingAddress,
      payment_method: paymentMethod
    },
    authToken
  );

  if (paymentMethod === 'COD') {
    return {
      order,
      payment: null,
      paymentStatusLabel: `${order.payment_status} (${order.fulfilment_status})`
    };
  }

  const verified = await startRazorpayStandardCheckout({
    orderScope: 'RETAIL',
    orderId: order.order_id,
    authToken,
    buyer
  });

  return {
    order,
    payment: verified,
    paymentStatusLabel: `${verified.payment_status} (${verified.fulfilment_status})`
  };
}

/**
 * Full server-authoritative Razorpay Standard Checkout flow for an existing server order:
 * 1. POST /api/v1/payments/razorpay/create-order -> server creates Razorpay order
 * 2. Open Razorpay Checkout modal -> customer pays via UPI / Card / NetBanking
 * 3. POST /api/v1/payments/razorpay/verify -> server verifies HMAC & capture state
 */
export async function startRazorpayStandardCheckout({
  orderScope = 'RETAIL',
  orderId,
  authToken,
  buyer = {},
  idempotencyKey = generateIdempotencyKey('rzp')
}) {
  if (!canAttemptBackend()) {
    throw new Error('FastAPI backend is not configured on this host.');
  }
  if (!authToken) {
    throw new Error('Sign in with Clerk to initiate server-verified Razorpay checkout.');
  }

  const orderData = await apiRequest('/api/v1/payments/razorpay/create-order', {
    method: 'POST',
    token: authToken,
    body: {
      order_scope: orderScope,
      order_id: orderId,
      idempotency_key: idempotencyKey
    }
  });

  const RazorpayCtor = await loadRazorpayScript();

  return new Promise((resolve, reject) => {
    const rzp = new RazorpayCtor({
      key: orderData.razorpay_key_id,
      amount: orderData.amount_paise,
      currency: orderData.currency,
      name: 'HunarLink',
      description: `Order ${orderData.order_number} (Razorpay Standard Checkout)`,
      order_id: orderData.razorpay_order_id,
      prefill: {
        name: buyer.name || '',
        email: buyer.email || '',
        contact: buyer.phone || ''
      },
      theme: { color: '#143326' },
      modal: {
        ondismiss: () => reject(new Error('Payment modal closed before completion.'))
      },
      handler: async (response) => {
        try {
          const verified = await apiRequest('/api/v1/payments/razorpay/verify', {
            method: 'POST',
            token: authToken,
            body: {
              payment_id: orderData.payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            }
          });
          resolve(verified);
        } catch (err) {
          reject(err);
        }
      }
    });

    rzp.on('payment.failed', (failure) => {
      reject(new Error(failure?.error?.description || 'Payment failed at Razorpay.'));
    });

    rzp.open();
  });
}
