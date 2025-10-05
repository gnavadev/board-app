import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// --- 1. Add these imports for the icon plugins ---
import Components from 'unplugin-vue-components/vite'
import Icons from 'unplugin-icons/vite'
import IconsResolver from 'unplugin-icons/resolver'

// https://vitejs.dev/config/
export default defineConfig({
    base: './',
    plugins: [
        vue(),

        // --- 2. Add the plugin configurations here ---
        Components({
            resolvers: [
                IconsResolver({
                    prefix: 'icon',
                }),
            ],
        }),
        Icons({
            autoInstall: true,
        }),
    ],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('../src', import.meta.url))
        }
    },
    server: {
        port: 8080
    }
})