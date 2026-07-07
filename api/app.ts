/**
 * This is a API server
 */

import './lib/loadEnv.js';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import adminRoutes from './routes/admin.js';
import publicRoutes from './routes/public.js';
import webhookRoutes from './routes/webhook.js';

const app: express.Application = express();

app.use(cors());
app.use(
  express.json({
    limit: '10mb',
    verify: (req, _res, buffer) => {
      (req as Request).rawBody = buffer.toString('utf8');
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * API Routes
 */
app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/webhook', webhookRoutes);

/**
 * health
 */
app.get('/api/health', (_req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    message: 'ok',
  });
});

/**
 * error handler middleware
 */
app.use((error: Error, _req: Request, res: Response) => {
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  });
});

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  });
});

export default app;
