// Lets plain Node resolve the kb's `#lib/…` imports (Vite does it in the real build).
import { register } from 'node:module';

register('./lib-alias-hooks.mjs', import.meta.url);
