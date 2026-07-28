// Loads and validates environment variables ONE time at startup.
// If a required secret is missing, the server refuses to start rather
// than silently running with broken payment configuration.

require('dotenv').config();

const REQUIRED_VARS = [
  'MPESA_CONSUMER_KEY',
  'MPESA_CONSUMER_SECRET',
  'MPESA_SHORTCODE',
  'MPESA_PASSKEY',
  'MPESA_CALLBACK_URL',
];

function requireEnv(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Fail fast: check every required secret exists before the app boots.
for (const key of REQUIRED_VARS) {
  if (!process.env[key]) {
    // eslint-disable-next-line no-console
    console.error(
      `[FATAL] Missing required environment variable "${key}". ` +
      `Copy .env.example to .env and fill in your Daraja credentials.`
    );
    process.exit(1);
  }
}

const isProd = (process.env.MPESA_ENV || 'sandbox') === 'production';

module.exports = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendOrigins: (process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  mpesa: {
    env: process.env.MPESA_ENV || 'sandbox',
    isProd,
    baseUrl: isProd
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke',
    consumerKey: requireEnv('MPESA_CONSUMER_KEY'),
    consumerSecret: requireEnv('MPESA_CONSUMER_SECRET'),
    shortcode: requireEnv('MPESA_SHORTCODE'),
    passkey: requireEnv('MPESA_PASSKEY'),
    transactionType: process.env.MPESA_TRANSACTION_TYPE || 'CustomerBuyGoodsOnline',
    callbackUrl: requireEnv('MPESA_CALLBACK_URL'),
  },

  databasePath: process.env.DATABASE_PATH || './data/sunripe.db',
};
