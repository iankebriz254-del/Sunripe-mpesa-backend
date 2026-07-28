// Talks to the Safaricom Daraja API. This is the ONLY file that knows
// about Daraja's HTTP endpoints — everything else (controllers, routes)
// calls the plain functions exported here.

const axios = require('axios');
const { mpesa } = require('../config/env');
const logger = require('../utils/logger');

let cachedToken = null;
let cachedTokenExpiry = 0; // epoch ms

/**
 * Gets an OAuth access token from Daraja, caching it until shortly
 * before it expires (tokens are valid ~1 hour) to avoid hammering
 * the auth endpoint on every checkout.
 */
async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiry) return cachedToken;

  const credentials = Buffer.from(
    `${mpesa.consumerKey}:${mpesa.consumerSecret}`
  ).toString('base64');

  try {
    const { data } = await axios.get(
      `${mpesa.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${credentials}` }, timeout: 15000 }
    );

    cachedToken = data.access_token;
    // Refresh 60s before actual expiry as a safety margin.
    cachedTokenExpiry = now + (Number(data.expires_in) - 60) * 1000;
    return cachedToken;
  } catch (err) {
    logger.error('Failed to obtain Daraja access token', {
      error: err.response?.data || err.message,
    });
    throw new Error('Could not authenticate with M-Pesa. Please try again shortly.');
  }
}

function buildTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function buildPassword(timestamp) {
  return Buffer.from(`${mpesa.shortcode}${mpesa.passkey}${timestamp}`).toString('base64');
}

/**
 * Initiates an STK Push ("Lipa Na M-Pesa Online") — this is what makes
 * the payment prompt pop up on the customer's phone.
 *
 * @param {string} phone         Normalized 2547XXXXXXXX phone number
 * @param {number} amount        Amount in KES (whole shillings)
 * @param {string} accountRef    Shown to the customer, e.g. the order ref
 * @param {string} transactionDesc Short description, e.g. "Sun Ripe order"
 */
async function initiateSTKPush({ phone, amount, accountRef, transactionDesc }) {
  const token = await getAccessToken();
  const timestamp = buildTimestamp();
  const password = buildPassword(timestamp);

  const payload = {
    BusinessShortCode: mpesa.shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: mpesa.transactionType, // CustomerBuyGoodsOnline for a Till
    Amount: Math.round(amount), // Daraja expects a whole-number amount
    PartyA: phone,
    PartyB: mpesa.shortcode,
    PhoneNumber: phone,
    CallBackURL: mpesa.callbackUrl,
    AccountReference: accountRef.slice(0, 12), // Daraja limits this field
    TransactionDesc: transactionDesc.slice(0, 13),
  };

  try {
    const { data } = await axios.post(
      `${mpesa.baseUrl}/mpesa/stkpush/v1/processrequest`,
      payload,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 }
    );
    // data: { MerchantRequestID, CheckoutRequestID, ResponseCode, ResponseDescription, CustomerMessage }
    return data;
  } catch (err) {
    logger.error('STK Push request failed', {
      error: err.response?.data || err.message,
    });
    throw new Error('Could not start the M-Pesa payment. Please try again.');
  }
}

/**
 * Actively queries Safaricom for the outcome of an STK Push.
 * Used as a fallback if the callback hasn't arrived yet when the
 * frontend polls for status (callbacks can occasionally be delayed).
 */
async function querySTKStatus(checkoutRequestId) {
  const token = await getAccessToken();
  const timestamp = buildTimestamp();
  const password = buildPassword(timestamp);

  const payload = {
    BusinessShortCode: mpesa.shortcode,
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  };

  try {
    const { data } = await axios.post(
      `${mpesa.baseUrl}/mpesa/stkpushquery/v1/query`,
      payload,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
    );
    return data; // { ResultCode, ResultDesc, ... }
  } catch (err) {
    // A 500 here often just means "still pending" on Safaricom's side —
    // treat query failures as "unknown yet" rather than a hard error.
    logger.warn('STK status query failed (likely still pending)', {
      error: err.response?.data || err.message,
    });
    return null;
  }
}

module.exports = { getAccessToken, initiateSTKPush, querySTKStatus };
