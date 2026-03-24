/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: [],
  // Increase body size limit for audio file uploads (up to 50MB)
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
}

export default nextConfig
