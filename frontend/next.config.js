/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['localhost', 'storage.yandexcloud.net'],
  },
};

module.exports = nextConfig;
