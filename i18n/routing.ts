import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['en', 'pt', 'es', 'fr'],
  defaultLocale: 'en',
  localePrefix: 'always',
  localeDetection: true,
})

export type Locale = (typeof routing.locales)[number]
