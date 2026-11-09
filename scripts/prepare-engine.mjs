import {cp, mkdir} from 'node:fs/promises';

await mkdir(new URL('../public/vendor/xr/', import.meta.url), {recursive: true});
await cp(new URL('../node_modules/@8thwall/engine-binary/dist/', import.meta.url), new URL('../public/vendor/xr/', import.meta.url), {recursive: true});
await cp(new URL('../node_modules/@8thwall/engine-binary/LICENSE', import.meta.url), new URL('../public/ENGINE-LICENSE.txt', import.meta.url));
await cp(new URL('../node_modules/three/LICENSE', import.meta.url), new URL('../public/THREE-LICENSE.txt', import.meta.url));
console.log('AR engine copied without modification.');
