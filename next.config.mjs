import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const configuredDevOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const detectedLanOrigins = Object.values(os.networkInterfaces())
  .flat()
  .filter(address => address?.family === 'IPv4' && !address.internal)
  .map(address => address.address);
const allowedDevOrigins = [...new Set(['localhost', '127.0.0.1', ...detectedLanOrigins, ...configuredDevOrigins])];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone', // For Docker deployment
  outputFileTracingRoot: projectRoot,
  // Permit development assets and HMR when testing from phones or tablets on
  // the same LAN. Origins are explicit interface addresses, never a wildcard.
  allowedDevOrigins,

  experimental: {
    optimizePackageImports: ['@mui/material', '@mui/icons-material'],
    // Keep production container builds viable on small CI/Docker workers.
    // Next.js documents this as a low-risk tradeoff: slightly slower builds
    // in exchange for a lower peak Webpack memory footprint.
    webpackMemoryOptimizations: true,
    webpackBuildWorker: true,
    serverSourceMaps: false,
  },

  enablePrerenderSourceMaps: false,

  images: {
    unoptimized: true,
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: '**.githubusercontent.com',
      },
    ],
  },

  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],

  async headers() {
    const securityHeaders = [
      {
        key: 'X-DNS-Prefetch-Control',
        value: 'on',
      },
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'X-Frame-Options',
        value: 'SAMEORIGIN',
      },
      {
        key: 'X-XSS-Protection',
        value: '1; mode=block',
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=()',
      },
    ];

    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/api/:path*',
        headers: [
          ...securityHeaders,
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.ALLOWED_ORIGINS || '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
        ],
      },
    ];
  },

};

export default nextConfig;
