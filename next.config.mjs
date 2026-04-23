import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

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

export default withNextIntl(nextConfig)
