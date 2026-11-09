import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createCouch} from '../src/couch.js';
import {ArSession} from '../src/ar-session.js';
import {PRODUCT, usableHit} from '../src/config.js';

const bytes = await readFile(new URL('../public/models/couch.glb', import.meta.url));
const {scene: source} = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
globalThis.window = {devicePixelRatio: 1};

function rig() {
  let now = 1000;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 20);
  const renderer = {shadowMap: {}};
  let callbacks, stopped = 0, tracksStopped = 0, runs = 0, params, hit = null;
  const xr = {
    loadChunk: async () => {},
    XrController: {configure: () => {}, pipelineModule: () => ({name: 'reality'}), updateCameraProjectionMatrix: () => {}, hitTest: () => hit ? [hit] : []},
    GlTextureRenderer: {pipelineModule: () => ({name: 'background'})},
    Threejs: {pipelineModule: () => ({name: 'three'}), xrScene: () => ({scene, camera, renderer})},
    XrConfig: {device: () => ({MOBILE: 'mobile'}), camera: () => ({BACK: 'back'})},
    addCameraPipelineModules(modules) { callbacks = modules.at(-1); },
    run(p) { ++runs; params = p; callbacks.onStart({stream: {getTracks: () => [{stop() { ++tracksStopped; }}]}}); camera.lookAt(0, 0, -2); camera.updateMatrixWorld(); },
    stop() { ++stopped; },
    pause() { callbacks.onPaused(); },
    resume() { callbacks.onResume(); },
  };
  const ar = new ArSession({getBoundingClientRect: () => ({width: 390, height: 780, left: 0, top: 0})}, source, {engineLoader: async () => xr, now: () => now});
  return {ar, camera, xr, callbacks: () => callbacks,
    tick(normal = true, count = 1) { for (let i = 0; i < count; i++) callbacks.onUpdate({processCpuResult: {reality: {trackingStatus: normal ? 'NORMAL' : 'LIMITED'}}}); },
    time(value) { now = value; },
    hit(value) { hit = value; },
    stats: () => ({stopped, tracksStopped, runs, params}),
  };
}

test('model is calibrated to the displayed fixed prototype dimensions', () => {
  const couch = createCouch(source);
  couch.anchor.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(couch.anchor);
  const size = bounds.getSize(new THREE.Vector3());
  for (const [axis, expected] of [['x', PRODUCT.width], ['y', PRODUCT.height], ['z', PRODUCT.depth]]) assert.ok(Math.abs(size[axis] - expected) < 0.00001);
  assert.ok(Math.abs(bounds.min.y) < 0.00001);
  couch.dispose();
});

test('changing and restoring colors preserves position, rotation, scale, and geometry', () => {
  const couch = createCouch(source);
  couch.anchor.position.set(1.2, 0, -2.4);
  couch.anchor.rotation.y = 0.43;
  couch.anchor.updateMatrixWorld(true);
  const transform = couch.anchor.matrixWorld.toArray();
  const snapshots = [];
  couch.anchor.traverse(o => { if (o.isMesh) snapshots.push({object: o, geometry: o.geometry, color: o.material.color.clone()}); });
  couch.setColor('blue');
  assert.ok(snapshots.some(({object, color}) => !object.material.color.equals(color)));
  couch.setColor('red');
  couch.anchor.updateMatrixWorld(true);
  assert.deepEqual(couch.anchor.matrixWorld.toArray(), transform);
  for (const {object, geometry} of snapshots) assert.equal(object.geometry, geometry);
  couch.setColor('original');
  for (const {object, color} of snapshots) assert.ok(object.material.color.equals(color));
  couch.dispose();
});

test('surface filter rejects wall heights, feature points, malformed and distant hits', () => {
  const good = {type: 'DETECTED_SURFACE', position: {x: 1, y: 0, z: -2}, distance: 2};
  assert.equal(usableHit([good], 1.5), good);
  for (const hit of [{...good, type: 'FEATURE_POINT'}, {...good, position: {x: 1, y: 1, z: -2}}, {...good, distance: 9}, {...good, distance: NaN}]) assert.equal(usableHit([hit], 1.5), null);
});

test('placement waits for stable live tracking and rejects stale estimates', async () => {
  const r = rig();
  await r.ar.start();
  assert.equal(r.stats().params.cameraConfig.direction, 'back');
  assert.equal(r.stats().params.allowedDevices, 'mobile');
  assert.equal(r.ar.place(), false);
  r.tick(false, 12);
  assert.equal(r.ar.place(), false);
  r.tick(true, 7);
  assert.equal(r.ar.place(), false);
  r.tick(true);
  r.time(1500);
  assert.equal(r.ar.place(), false);
  r.tick(true);
  assert.equal(r.ar.place(), true);
  const transform = r.ar.couch.anchor.position.toArray();
  r.ar.setColor('blue');
  r.tick(true, 20);
  assert.deepEqual(r.ar.couch.anchor.position.toArray(), transform);
  r.ar.stop();
});

test('a sudden placement jump invalidates the old candidate until it is steady again', async () => {
  const r = rig();
  await r.ar.start();
  r.tick(true, 8);
  assert.ok(r.ar.candidate);
  r.hit({type: 'ESTIMATED_SURFACE', position: {x: 2, y: 0, z: -2}, distance: 3});
  r.tick(true);
  assert.equal(r.ar.candidate, null);
  assert.equal(r.ar.place(), false);
  r.tick(true, 7);
  assert.equal(r.ar.place(), true);
  assert.equal(r.ar.couch.anchor.position.x, 2);
  r.ar.stop();
});

test('tracking loss and pause block placement; closing camera releases tracks', async () => {
  const r = rig();
  await r.ar.start();
  r.tick(true, 8);
  r.tick(false);
  assert.equal(r.ar.place(), false);
  r.tick(true, 8);
  r.ar.pause();
  assert.equal(r.ar.place(), false);
  r.ar.resume();
  r.tick(true, 8);
  assert.equal(r.ar.place(), true);
  r.ar.stop();
  assert.equal(r.stats().tracksStopped, 1);
  assert.equal(r.stats().stopped, 1);
  assert.equal(r.ar.active, false);
});

test('canceling a move preserves the previous placement and current color', async () => {
  const r = rig();
  await r.ar.start();
  r.tick(true, 8);
  r.ar.place();
  const position = r.ar.couch.anchor.position.toArray();
  r.ar.setColor('red');
  r.ar.reposition();
  assert.equal(r.ar.placed, false);
  r.ar.cancelReposition();
  assert.equal(r.ar.placed, true);
  assert.equal(r.ar.color, 'red');
  assert.deepEqual(r.ar.couch.anchor.position.toArray(), position);
  r.ar.stop();
});

test('closing while engine loads prevents a late camera start', async () => {
  const r = rig();
  let resolve;
  r.ar.engineLoader = () => new Promise(done => { resolve = done; });
  const pending = r.ar.start();
  await Promise.resolve();
  r.ar.stop();
  resolve(r.xr);
  await pending;
  assert.equal(r.stats().runs, 0);
});

test('a late permission grant after closing immediately releases its camera tracks', async () => {
  const r = rig();
  await r.ar.start();
  r.ar.stop();
  let released = 0;
  const stream = {getTracks: () => [{stop() { ++released; }}]};
  r.callbacks().onCameraStatusChange({status: 'hasStream', stream});
  r.callbacks().onStart({stream});
  assert.equal(released, 2);
  assert.equal(r.ar.couch, null);
  assert.equal(r.ar.active, false);
});
