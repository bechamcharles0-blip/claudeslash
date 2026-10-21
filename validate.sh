#!/bin/bash

# Claude Router - Validation Script
# Run this to validate Tier 1 + Tier 2 deployment

echo "🚀 Claude Router - Deployment Validation"
echo "========================================"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS_COUNT=0
FAIL_COUNT=0

# Helper function to check command
check_command() {
    if command -v $1 &> /dev/null; then
        echo -e "${GREEN}✓${NC} $2"
        ((PASS_COUNT++))
    else
        echo -e "${RED}✗${NC} $2 (not found)"
        ((FAIL_COUNT++))
    fi
}

# Helper function to run test
run_test() {
    if $1 &> /dev/null; then
        echo -e "${GREEN}✓${NC} $2"
        ((PASS_COUNT++))
    else
        echo -e "${RED}✗${NC} $2 (failed)"
        ((FAIL_COUNT++))
    fi
}

# 1. Check prerequisites
echo "1️⃣  Checking Prerequisites"
echo "------------------------"
check_command node "Node.js installed"
check_command npm "npm installed"
check_command git "Git installed"
echo ""

# 2. Check build
echo "2️⃣  Checking Build"
echo "-----------------"
if npm run build &> /dev/null; then
    echo -e "${GREEN}✓${NC} TypeScript build successful (0 errors)"
    ((PASS_COUNT++))
else
    echo -e "${RED}✗${NC} TypeScript build failed"
    ((FAIL_COUNT++))
fi
echo ""

# 3. Check environment
echo "3️⃣  Checking Environment"
echo "-----------------------"
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo -e "${YELLOW}⚠${NC} ANTHROPIC_API_KEY not set (needed for real routing)"
else
    echo -e "${GREEN}✓${NC} ANTHROPIC_API_KEY is set"
    ((PASS_COUNT++))
fi
echo ""

# 4. Check dependencies
echo "4️⃣  Checking Dependencies"
echo "------------------------"
if [ -f "package.json" ]; then
    echo -e "${GREEN}✓${NC} package.json exists"
    ((PASS_COUNT++))
else
    echo -e "${RED}✗${NC} package.json not found"
    ((FAIL_COUNT++))
fi

if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC} node_modules exists"
    ((PASS_COUNT++))
else
    echo -e "${RED}✗${NC} node_modules not found (run: npm install)"
    ((FAIL_COUNT++))
fi
echo ""

# 5. Check key files
echo "5️⃣  Checking Key Files"
echo "---------------------"
FILES=(
    "src/core/modelRouter.ts"
    "src/core/modelSelector.ts"
    "src/core/analyticsValidation.ts"
    "src/core/metricsCacheRedis.ts"
    "src/core/statisticalAnalysis.ts"
    "src/api/rest.ts"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $file"
        ((PASS_COUNT++))
    else
        echo -e "${RED}✗${NC} $file (missing)"
        ((FAIL_COUNT++))
    fi
done
echo ""

# 6. Test summary
echo "📊 Validation Summary"
echo "===================="
echo -e "Passed: ${GREEN}$PASS_COUNT${NC}"
echo -e "Failed: ${RED}$FAIL_COUNT${NC}"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Run: npm test"
    echo "2. Run: npm run dev"
    echo "3. Test endpoints with curl (see DEPLOYMENT_VALIDATION_GUIDE.md)"
    exit 0
else
    echo -e "${RED}✗ Some checks failed${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Install dependencies: npm install"
    echo "2. Set API key: export ANTHROPIC_API_KEY=sk-..."
    echo "3. Rebuild: npm run build"
    exit 1
fi
