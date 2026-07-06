// @ts-check
import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cho phép mở dev server từ thiết bị khác trong LAN (điện thoại/tablet):
  // thiếu dòng này Next dev chặn tài nguyên /_next/* cross-origin → trang trắng.
  allowedDevOrigins: ['192.168.*', '10.*', '172.*', '*.local'],
  experimental: {
    // Stream agent/copilot đi qua proxy /hubapi có thể kéo dài (AI sinh bài,
    // tạo ảnh...) — 5 phút cho chắc.
    proxyTimeout: 300_000,
  },
  // Document-Policy header for browser profiling
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Document-Policy',
            value: 'js-profiling',
          },
        ],
      },
    ];
  },
  reactStrictMode: false,
  transpilePackages: ['crypto-hash'],
  // Enable production sourcemaps for Sentry
  productionBrowserSourceMaps: true,

  // Custom webpack config to ensure sourcemaps are generated properly
  webpack: (config, { buildId, dev, isServer, defaultLoaders }) => {
    // Enable sourcemaps for both client and server in production
    if (!dev) {
      config.devtool = isServer ? 'source-map' : 'hidden-source-map';
    }

    return config;
  },
  async redirects() {
    return [
      {
        // URL cũ /api/uploads → /uploads (media URL nay luôn dạng /uploads/…)
        source: '/api/uploads/:path*',
        destination: '/uploads/:path*',
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        // Media local LUÔN phục vụ qua route handler (app)/api/uploads.
        // KHÔNG phụ thuộc process.env.STORAGE_PROVIDER: giá trị này chỉ có ở
        // runtime (dotenv), nhưng next.config đóng băng rewrites vào
        // routes-manifest lúc BUILD → nếu build thiếu env thì mọi /uploads/*
        // bị đóng băng thành /404 (ảnh chết hàng loạt). Dự án tự host local nên
        // map vô điều kiện; cloud storage sinh URL công khai, không đi qua đây.
        source: '/uploads/:path*',
        destination: '/api/uploads/:path*',
      },
      // Proxy same-origin cho truy cập TỪ XA qua tunnel (1 URL công khai duy
      // nhất phục vụ cả backend lẫn bot — trình duyệt bên ngoài không thể gọi
      // thẳng cổng 3000/8088). Client tự chuyển sang các path này khi hostname
      // không phải localhost/LAN (xem resolveBaseUrl + getBotUrl).
      {
        source: '/hubapi/:path*',
        destination: 'http://127.0.0.1:3000/:path*',
      },
      {
        source: '/botapi/:path*',
        destination: 'http://127.0.0.1:8088/:path*',
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Sourcemap configuration optimized for monorepo
  sourcemaps: {
    disable: false,
    // More comprehensive asset patterns for monorepo
    assets: [
      '.next/static/**/*.js',
      '.next/static/**/*.js.map',
      '.next/server/**/*.js',
      '.next/server/**/*.js.map',
    ],
    ignore: [
      '**/node_modules/**',
      '**/*hot-update*',
      '**/_buildManifest.js',
      '**/_ssgManifest.js',
      '**/*.test.js',
      '**/*.spec.js',
    ],
    deleteSourcemapsAfterUpload: true,
  },

  // Release configuration
  release: {
    create: true,
    finalize: true,
    // Use git commit hash for releases in monorepo
    name:
      process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || undefined,
  },

  // NextJS specific optimizations for monorepo
  widenClientFileUpload: true,

  // Additional configuration
  telemetry: false,
  silent: process.env.NODE_ENV === 'production',
  debug: process.env.NODE_ENV === 'development',

  // Error handling for CI/CD
  errorHandler: (error) => {
    console.warn('Sentry build error occurred:', error.message);
    console.warn(
      'This might be due to missing Sentry environment variables or network issues'
    );
    // Don't fail the build if Sentry upload fails in monorepo context
    return;
  },
});
