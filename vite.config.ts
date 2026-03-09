import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import tsconfigPaths from 'vite-tsconfig-paths'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  plugins: [
    devtools(),
    nitro({
      rollupConfig: {
        external: [/^@sentry\//, /^sharp$/, /^node:/, /^fs$/, /^path$/]
      }
    }),
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  ssr: {
    noExternal: [],
    external: ['sharp', 'fs', 'path'],
  },
  optimizeDeps: {
    exclude: ['sharp', 'fs', 'path'],
  },
})

export default config
