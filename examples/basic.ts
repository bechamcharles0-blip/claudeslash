/**
 * Basic example: Using Claude Router in your own code
 */

import { ModelRouter } from '../src/index.js';

async function main() {
  // Initialize the router with your Anthropic API key
  const router = new ModelRouter(process.env.ANTHROPIC_API_KEY);

  // Example 1: Route a simple task
  console.log('📝 Example 1: Simple routing\n');
  const result1 = await router.route({
    task: 'Summarize the benefits of renewable energy in 2-3 sentences',
    budget: 50000, // max tokens
  });

  console.log(`✅ Model: ${result1.model}`);
  console.log(`💰 Cost: $${result1.cost.toFixed(4)}`);
  console.log(`📊 Tokens: ${result1.tokensUsed.input + result1.tokensUsed.output}`);
  console.log(`💾 Saved: ${result1.savings.tokensReduced} tokens (${result1.savings.percentReduced}%)`);
  console.log(`📖 Result: ${result1.result.substring(0, 150)}...\n`);

  // Example 2: Estimate before executing
  console.log('📝 Example 2: Token estimation\n');
  const estimatedTokens = await router.estimateTokens(
    'Write a detailed blog post about machine learning',
    'haiku'
  );
  console.log(`📊 Estimated tokens: ${estimatedTokens}\n`);

  // Example 3: Strict quality requirement
  console.log('📝 Example 3: Quality-focused routing\n');
  const result3 = await router.route({
    task: 'Explain quantum computing to a physicist',
    budget: 200000,
    minQuality: 8, // Only accept high quality (8/10 or better)
    allowedModels: ['sonnet', 'opus'], // Skip cheap Haiku for complex task
  });

  console.log(`✅ Model: ${result3.model} (quality: ${result3.quality}/10)`);
  console.log(`💰 Cost: $${result3.cost.toFixed(4)}`);
  console.log(`⏱️  Time: ${result3.executionTime}ms\n`);

  // Example 4: View statistics
  console.log('📊 Example 4: Router statistics\n');
  const stats = router.getStats();
  console.log(`Total requests: ${stats.totalRequests}`);
  console.log(`Total tokens saved: ${stats.totalTokensSaved}`);
  console.log(`Total cost saved: $${stats.totalCostSaved.toFixed(2)}`);
  console.log(`Model usage:`, stats.modelUsage);
}

main().catch(console.error);
