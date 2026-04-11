import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Volatile Fantasy Football',
    short_name: 'Volatile FF',
    description: 'Advanced Dynasty Analysis',
    start_url: '/',
    display: 'standalone',
    background_color: '#09090b', // zinc-950
    theme_color: '#4f46e5',      // indigo-600
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
