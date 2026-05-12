export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--am-bg)' }}
    >
      {children}
    </div>
  )
}
