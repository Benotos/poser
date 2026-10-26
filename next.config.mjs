/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  webpack: (config) => {
    config.externals.push("pino-pretty", "encoding");
    return config;
  },
};
export default nextConfig;
