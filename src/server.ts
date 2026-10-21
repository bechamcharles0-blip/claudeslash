import express from 'express';
import cors from 'cors';
import { createHandler } from 'graphql-http';
import { createRestAPI } from './api/rest.js';
import { createGraphQLSchema } from './api/graphql.js';
import { ModelRouter } from './core/modelRouter.js';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 3000;
const router = new ModelRouter(process.env.ANTHROPIC_API_KEY);

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Mount REST API
app.use('/api', createRestAPI(router));

// Mount GraphQL API
const graphqlSchema = createGraphQLSchema(router);
app.all('/graphql', createHandler({ schema: graphqlSchema }));

// Dashboard (simple HTML)
app.get('/dashboard', (req, res) => {
  const stats = router.getStats();
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Claude Router Dashboard</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; padding: 40px; }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { margin-bottom: 40px; font-size: 32px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 40px; }
        .card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 24px; }
        .card h3 { font-size: 14px; color: #94a3b8; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
        .card .value { font-size: 28px; font-weight: bold; color: #fff; }
        .models { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .model { text-align: center; padding: 16px; background: #0f172a; border-radius: 6px; }
        .model-name { font-weight: bold; margin-bottom: 6px; }
        .model-usage { font-size: 24px; font-weight: bold; color: #10b981; }
        .api-docs { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 24px; margin-top: 40px; }
        .api-docs h3 { margin-bottom: 16px; font-size: 18px; }
        .endpoint { background: #0f172a; padding: 12px 16px; border-radius: 6px; margin-bottom: 8px; font-family: monospace; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🤖 Claude Router Dashboard</h1>

        <div class="grid">
          <div class="card">
            <h3>Total Requests</h3>
            <div class="value">${stats.totalRequests}</div>
          </div>
          <div class="card">
            <h3>Tokens Saved</h3>
            <div class="value">${stats.totalTokensSaved.toLocaleString()}</div>
          </div>
          <div class="card">
            <h3>Cost Saved</h3>
            <div class="value">$${stats.totalCostSaved.toFixed(2)}</div>
          </div>
          <div class="card">
            <h3>Avg Quality</h3>
            <div class="value">${stats.averageQuality}/10</div>
          </div>
        </div>

        <h2 style="margin-bottom: 20px;">Model Usage Distribution</h2>
        <div class="models">
          <div class="model">
            <div class="model-name">Haiku</div>
            <div class="model-usage">${stats.modelUsage.haiku}</div>
          </div>
          <div class="model">
            <div class="model-name">Sonnet</div>
            <div class="model-usage">${stats.modelUsage.sonnet}</div>
          </div>
          <div class="model">
            <div class="model-name">Opus</div>
            <div class="model-usage">${stats.modelUsage.opus}</div>
          </div>
          <div class="model">
            <div class="model-name">Fable</div>
            <div class="model-usage">${stats.modelUsage.fable}</div>
          </div>
        </div>

        <div class="api-docs">
          <h3>API Endpoints</h3>
          <div class="endpoint">POST /api/route - Route a request to optimal model</div>
          <div class="endpoint">POST /api/direct - Use specific model directly</div>
          <div class="endpoint">GET /api/models - List available models</div>
          <div class="endpoint">POST /api/token-estimate - Estimate tokens before execution</div>
          <div class="endpoint">GET /api/stats - Get router statistics</div>
          <div class="endpoint">GET /api/config - Show current configuration</div>
          <div class="endpoint">POST /graphql - GraphQL endpoint</div>
        </div>
      </div>
    </body>
    </html>
  `;
  res.send(html);
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║          🤖 Claude Router API Started                      ║
╚════════════════════════════════════════════════════════════╝

✅ REST API:    http://localhost:${PORT}/api
✅ GraphQL:     http://localhost:${PORT}/graphql
✅ Dashboard:   http://localhost:${PORT}/dashboard
✅ Health:      http://localhost:${PORT}/api/health

📝 Example request:
  curl -X POST http://localhost:${PORT}/api/route \\
    -H "Content-Type: application/json" \\
    -d '{
      "task": "Summarize this text",
      "budget": 50000
    }'

Ready to optimize tokens! 🚀
  `);
});
