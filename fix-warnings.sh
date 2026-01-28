#!/bin/bash

# Script to automatically fix common ESLint warnings

echo "🔧 Fixing ESLint warnings..."

# Fix unused imports with eslint --fix
echo "📦 Removing unused imports..."
npx eslint --fix "**/*.{ts,tsx}" --rule '{"@typescript-eslint/no-unused-vars": "error"}' 2>/dev/null || true

echo "✅ Auto-fix complete!"
echo "⚠️  Some warnings may need manual fixing"
echo ""
echo "Run 'npm run build' to check remaining warnings"
