import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Hearth — Household Intelligence',
  description: 'Your smart household assistant',
  manifest: '/manifest.json',
  themeColor: '#3D3530',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Hearth',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  )
}
