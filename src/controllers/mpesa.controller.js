const mpesaService = require('../services/mpesa.service');
const ordersRepo = require('../db/orders.repo');
const txnRepo = require('../db/transactions.repo');
const { normalizePhone } = require('../utils/phone');
const logger = require('../utils/logger');

/**
 * POST /api/mpesa/stkpush
 * Body: { orderRef: string, phone: string }
 *
 * Triggers the M-Pesa payment prompt on the customer's phone.
 * Returns a CheckoutRequestID the frontend uses to poll for the result.
 */
async function initiatePayment(req, res) {
  const { orderRef, phone: rawPhone } = req.body;

  if (!orderRef || !rawPhone) {
    return res.status(400).json({ error: 'orderRef and phone are required.' });
  }

  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return res.status(400).json({
      error: 'Enter a valid Safaricom number, e.g. 07XXXXXXXX or 2547XXXXXXXX.',
    });
  }

  const order = ordersRepo.getOrderByRef(orderRef);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.status === 'Paid') {
    return res.status(409).json({ error: 'This order has already been paid.' });
  }

  try {
    const result = await mpesaService.initiateSTKPush({
      phone,
      amount: order.amount,
      accountRef: order.order_ref,
      transactionDesc: 'Sun Ripe order',
    });

    if (result.ResponseCode !== '0') {
      logger.warn('STK Push rejected by Daraja', { result });
      return res.status(502).json({ error: result.ResponseDescription || 'M-Pesa declined the request.' });
    }

    txnRepo.createTransaction({
      orderId: order.id,
      checkoutRequestId: result.CheckoutRequestID,
      merchantRequestId: result.MerchantRequestID,
      phone,
      amount: order.amount,
    });

    logger.info('STK Push initiated', { orderRef, checkoutRequestId: result.CheckoutRequestID });

    return res.status(200).json({
      checkoutRequestId: result.CheckoutRequestID,
      merchantRequestId: result.MerchantRequestID,
      message: result.CustomerMessage || 'Check your phone to complete payment.',
    });
  } catch (err) {
    logger.error('initiatePayment failed', { orderRef, error: err.message });
    return res.status(502).json({ error: err.message });
  }
}

/**
 * POST /api/mpesa/callback
 * Called DIRECTLY BY SAFARICOM (not the browser) once the customer
 * enters their PIN or cancels the prompt. This is the source of truth
 * for whether a payment succeeded — never trust the frontend alone.
 *
 * IMPORTANT: this URL must be public HTTPS and match MPESA_CALLBACK_URL
 * exactly, and it must NOT require authentication (Safaricom can't log in).
 */
function handleCallback(req, res) {
  // Always acknowledge receipt so Safaricom doesn't keep retrying —
  // even if something below fails, we respond 200 immediately after
  // parsing so the webhook isn't marked as broken.
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Callback received successfully' });

  try {
    const stkCallback = req.body?.Body?.stkCallback;
    if (!stkCallback) {
      logger.warn('Callback received with unexpected shape', { body: req.body });
      return;
    }

    const { CheckoutRequestID, ResultCode, ResultDesc } = stkCallback;
    const txn = txnRepo.getTransactionByCheckoutId(CheckoutRequestID);
    if (!txn) {
      logger.warn('Callback for unknown transaction', { CheckoutRequestID });
      return;
    }

    if (ResultCode === 0) {
      // Success — pull the receipt number, amount, phone, and date out
      // of the CallbackMetadata array (Safaricom returns it as a list
      // of {Name, Value} pairs rather than a plain object).
      const items = stkCallback.CallbackMetadata?.Item || [];
      const get = (name) => items.find((i) => i.Name === name)?.Value;

      txnRepo.completeTransaction(CheckoutRequestID, {
        status: 'Success',
        mpesaReceiptNumber: get('MpesaReceiptNumber'),
        transactionDate: String(get('TransactionDate') || ''),
        resultCode: ResultCode,
        resultDesc: ResultDesc,
        rawCallback: req.body,
      });

      ordersRepo.updateOrderStatus(txn.order_id, 'Paid');
      logger.info('Payment confirmed', {
        CheckoutRequestID,
        receipt: get('MpesaReceiptNumber'),
      });
    } else {
      // ResultCode 1032 = cancelled by user; anything else = failed.
      const status = ResultCode === 1032 ? 'Cancelled' : 'Failed';
      txnRepo.completeTransaction(CheckoutRequestID, {
        status,
        resultCode: ResultCode,
        resultDesc: ResultDesc,
        rawCallback: req.body,
      });
      logger.info('Payment not completed', { CheckoutRequestID, status, ResultDesc });
    }
  } catch (err) {
    logger.error('Error processing M-Pesa callback', { error: err.message });
  }
}

/**
 * GET /api/mpesa/status/:checkoutRequestId
 * Polled by the frontend every few seconds while the loading spinner
 * is showing. Reads local DB state first (fastest, and the source of
 * truth once the callback lands); falls back to actively querying
 * Safaricom if the callback seems delayed.
 */
async function getStatus(req, res) {
  const { checkoutRequestId } = req.params;
  const txn = txnRepo.getTransactionByCheckoutId(checkoutRequestId);
  if (!txn) return res.status(404).json({ error: 'Transaction not found.' });

  if (txn.status !== 'Pending') {
    return res.json({
      status: txn.status,
      mpesaReceiptNumber: txn.mpesa_receipt_number,
      resultDesc: txn.result_desc,
    });
  }

  // Still pending locally — ask Safaricom directly in case the callback
  // was delayed or dropped (rare, but happens on flaky networks).
  const ageMs = Date.now() - new Date(txn.created_at + 'Z').getTime();
  if (ageMs > 8000) {
    const query = await mpesaService.querySTKStatus(checkoutRequestId);
    if (query && query.ResultCode !== undefined) {
      const code = Number(query.ResultCode);
      if (code === 0) {
        // Confirmed successful — mark it paid even though the full
        // receipt details will still arrive (and be saved) via callback.
        txnRepo.completeTransaction(checkoutRequestId, {
          status: 'Success',
          resultCode: code,
          resultDesc: query.ResultDesc,
        });
        ordersRepo.updateOrderStatus(txn.order_id, 'Paid');
      } else {
        const status = code === 1032 ? 'Cancelled' : 'Failed';
        txnRepo.completeTransaction(checkoutRequestId, {
          status,
          resultCode: code,
          resultDesc: query.ResultDesc,
        });
      }
    }
  }

  const refreshed = txnRepo.getTransactionByCheckoutId(checkoutRequestId);
  return res.json({
    status: refreshed.status,
    mpesaReceiptNumber: refreshed.mpesa_receipt_number,
    resultDesc: refreshed.result_desc,
  });
}

module.exports = { initiatePayment, handleCallback, getStatus };
