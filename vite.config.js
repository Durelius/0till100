import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves this project at https://durelius.github.io/0till100/,
// so the production build needs base '/0till100/'. Local dev stays at '/'.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/0till100/' : '/',
  plugins: [react()],
  server: {
    host: true, // listen on 0.0.0.0 — reachable from other devices on the LAN
    port: 5173,
  },
}))
