# Couch AR — Live Colors

A real camera-based web app for Kartika’s couch prototype. The app uses self-hosted 8th Wall world tracking, Three.js, and the original v2 couch GLB. No Variant account, AR service key, or App Clip is required.

## GitHub Pages

The repository includes `.github/workflows/pages.yml`. Once GitHub Pages is configured to use **GitHub Actions**, each push to `main` installs the pinned dependencies, runs the tests, builds the complete static app, and deploys `dist/`.

Published URL after a successful deployment: **https://kartika6.github.io/ar-trial-v3/**

The AR engine is downloaded from its official npm package during the build and copied without modification. No runtime API key, account login, or repository secret is required. The existing v2 repository is separate from this project.

## Use on a phone

Open the deployed HTTPS URL directly in Safari on iPhone (iOS 16.4 or newer), or Chrome on a compatible Android phone. Tap **Start camera**, then allow Camera and Motion & Orientation access if asked. Microphone permission is not requested.

Point at a well-lit floor with some visible detail. Move slowly forward and back while the engine estimates physical scale. Once tracking is normal and a stable ground estimate is available, an orange ring appears and **Place couch** becomes available.

Tap **Color**, compare Original, Red, and Blue, then tap **Done**. Color changes update the same model’s upholstery materials without altering its placement or physical size. Tap the couch itself to open Color, or use Move, Rotate, and Size. Move allows a new placement; Keep current position cancels the move.

**Close camera** ends the session and releases camera tracks. Leaving the page stops the session. Switching apps pauses it; tap Continue camera when returning.

Desktop browsers show the real 3D model and colors, with instructions to open a phone for room tracking.

## Size and accuracy

The GLB’s original scale did not match the 84 × 38 × 34 inch labels in v2. This build calibrates its bounding box to those displayed prototype dimensions and does not offer free scaling. These are illustrative dimensions, not verified retail specifications. Edit `src/config.js` to enter verified dimensions in meters for a real product.

World tracking estimates scale and the horizontal ground plane. It is not a precision measuring tool. Actual floor alignment, scale, camera permissions, performance, and recovery must be checked on physical iPhone and Android devices. These hardware checks cannot be completed on the development Mac.

## Develop

Requires Node.js 22.12+ (Node.js 24 recommended).

```sh
npm ci
npm run dev
```

The predev step copies the original engine distribution and license files into `public/`. The local URL works for a desktop preview. Phone camera testing requires HTTPS. A loopback URL on the Mac is not a phone URL.

```sh
npm test
npm run build
npm run preview
```

## Publish on GitHub Pages

`npm run build` produces a complete static app in `dist/`, including the couch model and the unmodified AR engine. Publish the **contents of dist/** in a separate v3 repository or directory. Keep the whole `vendor/xr/` directory intact. The relative asset paths support a GitHub Pages subdirectory. Serve over HTTPS.

No backend, environment variables, API keys, or service registration are needed. Source files and `node_modules` do not need to be uploaded to GitHub Pages.

## Verification

The Node tests exercise the supplied GLB, physical dimension calibration, color changes without transform changes, original-color restoration, floor hit filtering, stable tracking requirements, stale placement rejection, tracking loss, pause/resume, canceled moves, camera shutdown, and closing while startup or permission requests are pending.

Browser QA covers the actual model and swatches, palette collapse, mobile layouts, desktop fallback, and loading the self-hosted engine and SLAM chunk. `tests/engine-smoke.html` is a development-only verification page and is not included in the production build. It does not open a camera.

On-device acceptance check: Start camera → allow permissions → scan floor → place → red → blue → original → Done → move → cancel move → rotate → switch apps → Continue camera → Close camera. Confirm the couch stays anchored during color changes and the phone’s camera indicator turns off on close.

## Licenses

The 8th Wall engine is distributed unchanged under the included XR Engine License Agreement, not MIT. See `dist/ENGINE-LICENSE.txt` after building. Its attribution and warranty disclaimer are available from About in the app. Three.js uses MIT (`dist/THREE-LICENSE.txt`). The couch asset is from Kartika’s `kartika6/ar-trial-v2` repository.
