import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { authMiddleware } from './middleware/auth';
import { initDatabase } from './db/init';
import { taskRoutes } from './routes/tasks';

const app = new Hono();

app.use('*', logger());
app.use('*', cors());

app.get('/health', (c) => c.json({ status: 'ok' }));

app.use('/api/*', authMiddleware);
app.route('/api/tasks', taskRoutes);

async function start() {
  await initDatabase();
  
  const port = process.env.PORT || 3001;
  console.log(`API Server listening on http://localhost:${port}`);
  
  serve({
    fetch: app.fetch,
    port: Number(port),
  });
}

start().catch(console.error);