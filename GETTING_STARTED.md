# Getting Started - Quick 10-Step Guide

Welcome to the NeuralChip AI Platform! Follow these 10 steps to get up and running.

## Step 1: Verify Prerequisites

Ensure you have the required tools installed:

```bash
node --version  # Should be ≥18.0.0
npm --version   # Should be ≥9.0.0
```

If not installed, download from [nodejs.org](https://nodejs.org/)

## Step 2: Install Dependencies

```bash
npm install
```

This installs all required packages including Next.js, MUI, TypeScript, and testing tools.

## Step 3: Set Up Environment

```bash
cp .env.example .env
```

Edit `.env` and add your OpenRouter API key:

```env
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

Get your API key at: https://openrouter.ai/keys

## Step 4: Start Development Server

```bash
npm run dev
```

Open http://localhost:3000 in your browser. You should see the NeuralChip homepage.

## Step 5: Explore the Pages

Navigate through the application:

- **Home** (`/`) - Hero section with features and stats
- **Products** (`/products`) - Product cards with specs
- **Architectures** (`/architectures`) - Technical deep dive
- **Benchmarks** (`/benchmarks`) - Performance comparisons
- **Docs** (`/docs`) - Documentation hub
- **Blog** (`/blog`) - Blog posts
- **Careers** (`/careers`) - Job listings
- **Contact** (`/contact`) - Contact form

## Step 6: Test the AI API

Open a new terminal and test the OpenRouter proxy:

```bash
curl -X POST http://localhost:3000/api/ai \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "What are neural processing units?"}
    ],
    "model": "anthropic/claude-3.5-sonnet",
    "max_tokens": 100
  }'
```

You should receive an AI-generated response.

## Step 7: Test Theme Switching

1. Click the sun/moon icon in the top-right corner
2. The theme should toggle between light and dark modes
3. Your preference is saved to localStorage

## Step 8: Run Tests

```bash
# Run unit tests
npm test

# Run E2E tests (keep dev server running)
npm run e2e
```

All tests should pass. If any fail, check the test output for details.

## Step 9: Build for Production

```bash
# Type check
npm run typecheck

# Lint code
npm run lint

# Build
npm run build

# Start production server
npm start
```

Visit http://localhost:3000 to see the production build.

## Step 10: Deploy with Docker

```bash
# Build and start with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f web

# Stop
docker-compose down
```

Your app is now running in a production Docker container!

## Next Steps

### Customize the Content

1. **Edit Brand Colors**: Modify `src/theme/index.ts`
2. **Update Content**: Edit page files in `app/`
3. **Add Products**: Update product data in `app/products/page.tsx`
4. **Customize Components**: Modify files in `src/components/`

### Add Features

- **CMS Integration**: Add Contentful or Sanity
- **Analytics**: Integrate Google Analytics or Plausible
- **Search**: Implement Algolia or local search
- **Authentication**: Add NextAuth.js
- **Database**: Connect PostgreSQL or MongoDB

### Production Deployment

See `DEPLOYMENT.md` for detailed deployment instructions for:

- Vercel
- Docker on VPS
- Docker + Nginx + SSL
- Kubernetes

### Performance Optimization

Run Lighthouse audit:

```bash
# Install Lighthouse CLI
npm install -g lighthouse

# Run audit
lighthouse http://localhost:3000 --view
```

Target scores: ≥95 for Performance, Accessibility, Best Practices, and SEO.

## Troubleshooting

### Port 3000 already in use

```bash
# Kill process on port 3000
npx kill-port 3000

# Or use a different port
PORT=3001 npm run dev
```

### API errors

- Verify `OPENROUTER_API_KEY` is set correctly in `.env`
- Check OpenRouter API status at https://openrouter.ai/status
- Ensure you have API credits

### Build errors

```bash
# Clear Next.js cache
rm -rf .next

# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Docker issues

```bash
# Rebuild containers
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

## Learning Resources

- **Next.js Docs**: https://nextjs.org/docs
- **MUI Documentation**: https://mui.com/material-ui/
- **Material Design 3**: https://m3.material.io/
- **OpenRouter API**: https://openrouter.ai/docs
- **TypeScript**: https://www.typescriptlang.org/docs

## Support

- **Documentation**: See `README.md` for full documentation
- **Deployment Guide**: See `DEPLOYMENT.md` for production setup
- **Issues**: GitHub Issues (when repo is public)
- **Email**: hello@neuralchip.ai

## Quick Reference

### Useful Commands

```bash
# Development
npm run dev              # Start dev server
npm run lint             # Run linter
npm run typecheck        # Check types
npm run format           # Format code

# Testing
npm test                 # Unit tests
npm run test:watch       # Watch mode
npm run e2e              # E2E tests
npm run e2e:ui           # E2E with UI

# Production
npm run build            # Build
npm start                # Start prod server

# Docker
docker-compose up -d     # Start containers
docker-compose logs -f   # View logs
docker-compose down      # Stop containers
```

### Project Structure

```
app/          → Pages and API routes
src/          → Components, theme, utilities
__tests__/    → Unit tests
e2e/          → End-to-end tests
public/       → Static assets
```

### Key Files

- `app/layout.tsx` - Root layout with theme
- `src/theme/index.ts` - Material Design 3 theme
- `app/api/ai/route.ts` - OpenRouter proxy
- `next.config.ts` - Next.js configuration
- `package.json` - Dependencies and scripts

---

Happy coding! 🚀

If you have questions, check the documentation or reach out for support.
