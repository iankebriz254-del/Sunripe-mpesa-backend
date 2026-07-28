const { v4: uuidv4 } = require('uuid');
const ordersRepo = require('../db/orders.repo');
const logger = require('../utils/logger');

/**
 * POST /api/orders
 * Body: { amount: number, items: array, phone?: string }
 *
 * Creates a "Pending" order BEFORE payment is attempted. The STK Push
 * step below references this order by its order_ref. Keeping order
 * creation separate from payment means we always have a record, even
 * if the customer abandons the M-Pesa prompt.
 */
function createOrder(req, res) {
  const { amount, items, phone } = req.body;

  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'A valid order amount is required.' });
  }
  if (amount > 150000) {
    // Safaricom's per-transaction STK Push limit is KES 150,000.
    return res.status(400).json({ error: 'Order amount exceeds the M-Pesa transaction limit.' });
  }

  const orderRef = `SRP-${uuidv4().split('-')[0].toUpperCase()}`;

  try {
    const order = ordersRepo.createOrder({ orderRef, phone, amount, items });
    logger.info('Order created', { orderRef, amount });
    return res.status(201).json({ orderRef: order.order_ref, amount: order.amount, status: order.status });
  } catch (err) {
    logger.error('Failed to create order', { error: err.message });
    return res.status(500).json({ error: 'Could not create order. Please try again.' });
  }
}

function getOrder(req, res) {
  const order = ordersRepo.getOrderByRef(req.params.orderRef);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  return res.json(order);
}

module.exports = { createOrder, getOrder };
