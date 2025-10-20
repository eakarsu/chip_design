# Deployment Guide

## Quick Deploy Checklist

- [ ] Set all environment variables
- [ ] Build and test locally
- [ ] Run security audit
- [ ] Configure domain and SSL
- [ ] Set up monitoring
- [ ] Configure backups
- [ ] Test health checks

## Environment Variables

Required for production:

```bash
NODE_ENV=production
OPENROUTER_API_KEY=sk-or-v1-xxxxx
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
ALLOWED_ORIGINS=https://yourdomain.com
```

## Deployment Options

### Option 1: Vercel (Recommended for Simplicity)

1. Push code to GitHub
2. Import project in Vercel dashboard
3. Add environment variables
4. Deploy

```bash
vercel --prod
```

### Option 2: Docker + VPS

```bash
# On your server
git clone your-repo
cd your-repo
cp .env.example .env
# Edit .env with production values

# Build and run
docker-compose up -d

# Check logs
docker-compose logs -f
```

### Option 3: Docker + Nginx + SSL

```bash
# Install certbot for SSL
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com

# Update nginx.conf with your domain
# Uncomment HTTPS section in nginx.conf

# Deploy with Nginx profile
docker-compose --profile with-nginx up -d
```

## Health Checks

```bash
# Check app health
curl https://yourdomain.com/api/health

# Expected response
{
  "status": "ok",
  "timestamp": "2024-01-15T12:00:00.000Z",
  "uptime": 12345.67
}
```

## Monitoring

Set up monitoring for:

- `/api/health` endpoint (30s interval)
- Response times
- Error rates
- Rate limit abuse logs
- Docker container health

## SSL/TLS Configuration

### Using Let's Encrypt

```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal is configured automatically
# Test renewal
sudo certbot renew --dry-run
```

### Manual Certificate

Place certificates in `./certs/`:
- `fullchain.pem`
- `privkey.pem`

Update nginx.conf SSL paths.

## Performance Optimization

### CDN Setup

Use CloudFlare or similar CDN:

1. Point domain to CDN
2. Configure caching rules
3. Enable Brotli compression
4. Set up page rules for static assets

### Database (if added later)

- Use connection pooling
- Enable query caching
- Set up read replicas
- Configure backup schedules

## Security Hardening

### Nginx Security Headers

Already configured in `nginx.conf`:
- X-Frame-Options
- X-Content-Type-Options
- X-XSS-Protection
- Referrer-Policy

### Rate Limiting

Currently configured:
- 10 requests/minute per IP for `/api/ai`
- Configurable in `src/lib/rateLimit.ts`

### Additional Security

```bash
# Update packages regularly
npm audit fix

# Use secrets management
# - AWS Secrets Manager
# - HashiCorp Vault
# - GitHub Secrets

# Enable firewall
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## Scaling

### Horizontal Scaling

```yaml
# docker-compose.yml
services:
  web:
    deploy:
      replicas: 3
      restart_policy:
        condition: on-failure
```

### Load Balancing

Add load balancer configuration in nginx.conf:

```nginx
upstream nextjs {
    least_conn;
    server web1:3000;
    server web2:3000;
    server web3:3000;
}
```

## Backup Strategy

### Application

```bash
# Backup environment
cp .env .env.backup

# Backup docker volumes
docker run --rm --volumes-from web -v $(pwd):/backup ubuntu tar cvf /backup/backup.tar /app
```

### Database (when added)

```bash
# PostgreSQL example
pg_dump dbname > backup.sql

# Automated backups
0 2 * * * /usr/bin/pg_dump dbname > /backups/db-$(date +\%Y\%m\%d).sql
```

## Rollback Procedure

```bash
# Docker
docker-compose down
git checkout <previous-commit>
docker-compose build
docker-compose up -d

# Vercel
vercel rollback
```

## Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose logs web

# Check environment
docker-compose exec web env

# Rebuild
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### API errors

```bash
# Test API directly
curl -X POST http://localhost:3000/api/ai \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "test"}]}'

# Check OpenRouter key
echo $OPENROUTER_API_KEY
```

### High memory usage

```bash
# Limit container memory
docker-compose.yml:
  web:
    mem_limit: 512m
    mem_reservation: 256m
```

## Post-Deployment

1. Test all routes
2. Run Lighthouse audit
3. Test AI API endpoint
4. Verify SSL certificate
5. Check health endpoint
6. Monitor error logs
7. Set up uptime monitoring
8. Configure alerts

## Support

- GitHub Issues: https://github.com/yourusername/repo/issues
- Email: devops@neuralchip.ai
