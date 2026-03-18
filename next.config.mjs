/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    // Support larger file uploads (up to 50MB)
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
}

export default nextConfig
