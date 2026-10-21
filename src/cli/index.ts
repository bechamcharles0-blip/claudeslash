#!/usr/bin/env node
import { ModelRouter } from '../core/modelRouter.js';
import { securityManager } from '../core/security.js';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const router = new ModelRouter(process.env.ANTHROPIC_API_KEY);

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    showHelp();
    return;
  }

  switch (command) {
    case 'route':
      await handleRoute(args.slice(1));
      break;
    case 'estimate':
      await handleEstimate(args.slice(1));
      break;
    case 'models':
      handleModels();
      break;
    case 'stats':
      handleStats();
      break;
    case 'server':
      startServer();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

function showHelp() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║          Claude Router CLI - Token Optimizer               ║
╚════════════════════════════════════════════════════════════╝

Usage: claude-router <command> [options]

Commands:
  route <task>              Route a task to optimal model
    --budget <tokens>       Max tokens (default: 100000)
    --quality <0-10>        Min quality threshold
    --models <list>         Allowed models (haiku,sonnet,opus)

  estimate <task>           Estimate tokens before execution
    --model <name>          Target model (default: haiku)

  models                    List available models and costs

  stats                     Show router statistics

  server                    Start the API server

Options:
  --help, -h               Show this help message
  --version, -v            Show version

Examples:
  $ claude-router route "Summarize this document"
  $ claude-router estimate "Write a blog post" --model sonnet
  $ claude-router models
  $ claude-router stats
  $ claude-router server
  `);
}

async function handleRoute(args: string[]) {
  const task = args[0];
  if (!task) {
    console.error('❌ Task is required');
    process.exit(1);
  }

  // Parse options
  const budget = parseInt(args[args.indexOf('--budget') + 1] || '100000');
  const quality = parseInt(args[args.indexOf('--quality') + 1] || '5');
  const modelsArg = args[args.indexOf('--models') + 1];
  const allowedModels = modelsArg ? modelsArg.split(',') : ['haiku', 'sonnet', 'opus'];

  // Validate input
  const validation = securityManager.validateInput(task);
  if (!validation.valid) {
    console.error(`❌ ${validation.reason}`);
    process.exit(1);
  }

  try {
    console.log('🔄 Processing...');
    const result = await router.route({
      task,
      budget,
      minQuality: quality,
      allowedModels: allowedModels as any,
    });

    console.log(`
✅ Routing Complete

Model:        ${result.model.toUpperCase()}
Effort:       ${result.effort}
Quality:      ${result.quality}/10
Cache Hit:    ${result.cacheHit ? 'Yes' : 'No'}

Tokens Used:
  Input:      ${result.tokensUsed.input}
  Output:     ${result.tokensUsed.output}
  Total:      ${result.tokensUsed.input + result.tokensUsed.output}

Cost:         $${result.cost.toFixed(4)}
Execution:    ${result.executionTime}ms

Savings:
  Tokens:     ${result.savings.tokensReduced} (${result.savings.percentReduced}%)
  Cost:       $${result.savings.estimatedCost.toFixed(4)}

Result:
─────────────────────────────────────────
${result.result.substring(0, 500)}${result.result.length > 500 ? '...' : ''}
─────────────────────────────────────────
    `);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function handleEstimate(args: string[]) {
  const task = args[0];
  if (!task) {
    console.error('❌ Task is required');
    process.exit(1);
  }

  const modelArg = args[args.indexOf('--model') + 1] || 'haiku';

  try {
    console.log('🔄 Estimating tokens...');
    const tokens = await router.estimateTokens(task, modelArg as any);
    const models = router.getModels();
    const model = models[modelArg as any];

    const cost =
      (tokens / 1_000_000) *
      (model.costPer1MTok.input + model.costPer1MTok.output / 2);

    console.log(`
✅ Token Estimate

Task:         ${task.substring(0, 50)}${task.length > 50 ? '...' : ''}
Model:        ${modelArg.toUpperCase()}
Tokens:       ${tokens}
Cost:         $${cost.toFixed(6)}
    `);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

function handleModels() {
  const models = router.getModels();

  console.log(`
╔════════════════════════════════════════════════════════════╗
║                  Available Models                          ║
╚════════════════════════════════════════════════════════════╝
  `);

  for (const [name, config] of Object.entries(models) as any) {
    console.log(`
${name.toUpperCase()}
  API ID:       ${config.apiId}
  Speed:        ${config.speed} tokens/sec
  Quality:      ${config.quality}/10
  Max Tokens:   ${config.maxTokens.toLocaleString()}
  Cost/1M:      $${config.costPer1MTok.input} (in) / $${config.costPer1MTok.output} (out)
  Capabilities: ${config.capabilities.join(', ')}
    `);
  }
}

function handleStats() {
  const stats = router.getStats();

  console.log(`
╔════════════════════════════════════════════════════════════╗
║                   Router Statistics                        ║
╚════════════════════════════════════════════════════════════╝

Total Requests:      ${stats.totalRequests}
Tokens Saved:        ${stats.totalTokensSaved.toLocaleString()}
Cost Saved:          $${stats.totalCostSaved.toFixed(2)}
Average Quality:     ${stats.averageQuality}/10
Escalation Rate:     ${(stats.escalationRate * 100).toFixed(1)}%

Model Distribution:
  Haiku:  ${stats.modelUsage.haiku}
  Sonnet: ${stats.modelUsage.sonnet}
  Opus:   ${stats.modelUsage.opus}
  Fable:  ${stats.modelUsage.fable}
  `);
}

function startServer() {
  console.log('Starting API server...');
  import('../server.js');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
