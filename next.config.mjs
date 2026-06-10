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
  // Mantém o ffmpeg-static FORA do bundle do server: empacotado, o __dirname
  // dele é reescrito pra um path sentinela (\ROOT\...) e o spawn do binário dá
  // ENOENT. Externalizado, vira require() normal de node_modules e o caminho
  // do ffmpeg.exe resolve certo. Combina com outputFileTracingIncludes, que
  // garante o binário no deploy da Vercel.
  serverExternalPackages: ['ffmpeg-static'],
  outputFileTracingIncludes: {
    '/api/calls/chunk': ['./node_modules/ffmpeg-static/**'],
  },
}

export default withNextIntl(nextConfig)
