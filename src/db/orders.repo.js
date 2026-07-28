// All SQL for the "orders" table lives here, so controllers never
// write raw SQL directly.

const db = require('./database');

function createOrder({ orderRef, phone, amount, items }) {
  const stmt = db.prepare(`
    INSERT INTO orders (order_ref, customer_phone, amount, items_json)
    VALUES (@orderRef, @phone, @amount, @items)
  `);
  const info = stmt.run({
    orderRef,
    phone: phone || null,
    amount,
    items: items ? JSON.stringify(items) : null,
  });
  return getOrderById(info.lastInsertRowid);
}

function getOrderById(id) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
}

function getOrderByRef(orderRef) {
  return db.prepare('SELECT * FROM orders WHERE order_ref = ?').get(orderRef);
}

function updateOrderStatus(id, status) {
  db.prepare(`
    UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?
  `).run(status, id);
  return getOrderById(id);
}

module.exports = { createOrder, getOrderById, getOrderByRef, updateOrderStatus };
