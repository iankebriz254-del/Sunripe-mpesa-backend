const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const env = require('./config/env');
require('./db/database'); // creates the DB file + tables on first run

const ordersRoutes = require('./routes/orders.routes');
const mpesaRoutes = require('./routes/mpesa.routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();

// --- Security & parsing middleware ---
app.use(helmet());
app.use(
  cors({
    origin: env.frontendOrigins.length ? env.frontendOrigins : false,
    methods: ['GET', 'POST'],
  })
);
app.use(express.json({ limit: '100kb' }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

// --- Health check (useful for uptime monitors / load balancers) ---
app.get('/health', (req, res) => res.json({ status: 'ok', env: env.mpesa.env }));

// --- API routes ---
app.use('/api/orders', ordersRoutes);
app.use('/api/mpesa', mpesaRoutes);

// --- Fallbacks ---
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.port, () => {
  logger.info(`Sun Ripe M-Pesa backend running`, {
    port: env.port,
    mpesaEnv: env.mpesa.env,
    callbackUrl: env.mpesa.callbackUrl,
  });
});
