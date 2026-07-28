// All SQL for the "mpesa_transactions" table lives here.

const db = require('./database');

function createTransaction({ orderId, checkoutRequestId, merchantRequestId, phone, amount }) {
  db.prepare(`
    INSERT INTO mpesa_transactions
      (order_id, checkout_request_id, merchant_request_id, phone_number, amount, status)
    VALUES (@orderId, @checkoutRequestId, @merchantRequestId, @phone, @amount, 'Pending')
  `).run({ orderId, checkoutRequestId, merchantRequestId, phone, amount });
  return getTransactionByCheckoutId(checkoutRequestId);
}

function getTransactionByCheckoutId(checkoutRequestId) {
  return db
    .prepare('SELECT * FROM mpesa_transactions WHERE checkout_request_id = ?')
    .get(checkoutRequestId);
}

/**
 * Records the final result of an STK Push (from either the Safaricom
 * callback or a manual status query) and returns the updated row.
 */
function completeTransaction(checkoutRequestId, {
  status,
  mpesaReceiptNumber,
  transactionDate,
  resultCode,
  resultDesc,
  rawCallback,
}) {
  db.prepare(`
    UPDATE mpesa_transactions
    SET status = @status,
        mpesa_receipt_number = @mpesaReceiptNumber,
        transaction_date = @transactionDate,
        result_code = @resultCode,
        result_desc = @resultDesc,
        raw_callback = @rawCallback,
        updated_at = datetime('now')
    WHERE checkout_request_id = @checkoutRequestId
  `).run({
    checkoutRequestId,
    status,
    mpesaReceiptNumber: mpesaReceiptNumber || null,
    transactionDate: transactionDate || null,
    resultCode: resultCode ?? null,
    resultDesc: resultDesc || null,
    rawCallback: rawCallback ? JSON.stringify(rawCallback) : null,
  });
  return getTransactionByCheckoutId(checkoutRequestId);
}

module.exports = { createTransaction, getTransactionByCheckoutId, completeTransaction };
