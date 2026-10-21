#!/bin/bash

# Claude Router - cURL Examples
# These examples show how to use the REST API

BASE_URL="http://localhost:3000"

echo "🤖 Claude Router - REST API Examples"
echo "======================================"
echo ""

# Example 1: Basic routing
echo "1️⃣  Route a simple task:"
curl -X POST "$BASE_URL/api/route" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "What is machine learning?",
    "budget": 50000
  }' | jq '.'

echo ""
echo "---"
echo ""

# Example 2: Estimate tokens
echo "2️⃣  Estimate tokens before execution:"
curl -X POST "$BASE_URL/api/token-estimate" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Write a detailed article about AI",
    "model": "sonnet"
  }' | jq '.'

echo ""
echo "---"
echo ""

# Example 3: List models
echo "3️⃣  List all available models:"
curl -s "$BASE_URL/api/models" | jq '.'

echo ""
echo "---"
echo ""

# Example 4: Get statistics
echo "4️⃣  View router statistics:"
curl -s "$BASE_URL/api/stats" | jq '.'

echo ""
echo "---"
echo ""

# Example 5: Check configuration
echo "5️⃣  View configuration:"
curl -s "$BASE_URL/api/config" | jq '.'

echo ""
echo "---"
echo ""

# Example 6: Health check
echo "6️⃣  Health check:"
curl -s "$BASE_URL/api/health" | jq '.'

echo ""
echo "---"
echo ""

# Example 7: GraphQL query
echo "7️⃣  GraphQL query (list models):"
curl -X POST "$BASE_URL/graphql" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ models { name quality speed maxTokens } }"
  }' | jq '.'

echo ""
echo "---"
echo ""

# Example 8: GraphQL mutation (route)
echo "8️⃣  GraphQL mutation (route task):"
curl -X POST "$BASE_URL/graphql" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { route(task: \"Hello world\", budget: 50000) { result model tokensUsed { input output } } }"
  }' | jq '.'
