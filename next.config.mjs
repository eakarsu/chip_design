/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  output: 'standalone', // For Docker deployment

  experimental: {
    optimizePackageImports: ['@mui/material', '@mui/icons-material'],
  },

  images: {
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
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.ALLOWED_ORIGINS || '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
        ],
      },
    ];
  },

  webpack: (config) => {
    config.module.rules.push({
      test: /\.ya?ml$/,
      use: 'js-yaml-loader',
    });
    return config;
  },
};

export default nextConfig;
