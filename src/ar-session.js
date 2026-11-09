import * as THREE from 'three';
import {createCouch} from './couch.js';
import {PLACEMENT_MAX_AGE_MS, usableHit} from './config.js';

let enginePromise;

export function loadEngine() {
  if (window.XR8) return Promise.resolve(window.XR8);
  if (enginePromise) return enginePromise;
  window.THREE = THREE;
  enginePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    let timer;
    const clear = () => { clearTimeout(timer); window.removeEventListener('xrloaded', loaded); };
    const fail = () => { clear(); script.remove(); enginePromise = undefined; reject(new Error('The AR files could not load. Check your connection and try again.')); };
    const loaded = () => { clear(); resolve(window.XR8); };
    window.addEventListener('xrloaded', loaded, {once: true});
    script.src = new URL('vendor/xr/xr.js', document.baseURI).href;
    script.async = true;
    script.dataset.preloadChunks = 'slam';
    script.onerror = fail;
    timer = setTimeout(fail, 45000);
    document.head.append(script);
  });
  return enginePromise;
}

// Call directly from the Start button so iOS receives a user gesture.
export async function requestMotionAccess() {
  const requests = [window.DeviceMotionEvent, window.DeviceOrientationEvent]
    .filter(type => typeof type?.requestPermission === 'function')
    .map(type => type.requestPermission());
  if ((await Promise.all(requests)).some(result => result !== 'granted')) {
    throw new Error('Motion access is needed to keep the couch in place. Allow Motion & Orientation access, then try again.');
  }
}

export class ArSession extends EventTarget {
  constructor(canvas, source, {engineLoader = loadEngine, now = () => performance.now()} = {}) {
    super();
    this.canvas = canvas;
    this.source = source;
    this.engineLoader = engineLoader;
    this.now = now;
    this.active = false;
    this.paused = false;
    this.placed = false;
    this.tracking = false;
    this.color = 'original';
    this.candidate = null;
    this.steadyFrames = 0;
    this.previousPoint = null;
    this.generation = 0;
    this.installed = false;
    this.raycaster = new THREE.Raycaster();
    this.floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  emit(type, detail = {}) { this.dispatchEvent(new CustomEvent(type, {detail})); }

  async start(motionPermission = Promise.resolve()) {
    const generation = ++this.generation;
    await motionPermission;
    const xr = await this.engineLoader();
    await xr.loadChunk('slam');
    if (generation !== this.generation) return;
    this.xr = xr;
    this.active = true;
    this.paused = false;
    this.placed = false;
    this.tracking = false;
    this.clearCandidate();
    xr.XrController.configure({scale: 'absolute', disableWorldTracking: false});
    if (!this.installed) {
      xr.addCameraPipelineModules([
        xr.GlTextureRenderer.pipelineModule(),
        xr.Threejs.pipelineModule(),
        xr.XrController.pipelineModule(),
        this.pipeline(),
      ]);
      this.installed = true;
    }
    this.resizeCanvas();
    xr.run({canvas: this.canvas, webgl2: true, allowedDevices: xr.XrConfig.device().MOBILE,
      cameraConfig: {direction: xr.XrConfig.camera().BACK},
      glContextConfig: {alpha: false, antialias: true}});
  }

  pipeline() {
    return {
      name: 'couch-live-colors',
      onStart: ({stream}) => {
        if (!this.active) { stream?.getTracks().forEach(track => track.stop()); return; }
        this.stream = stream;
        this.initScene(this.xr.Threejs.xrScene());
        this.emit('started');
      },
      onCameraStatusChange: ({status, stream}) => {
        if (!this.active) { stream?.getTracks().forEach(track => track.stop()); return; }
        if (stream) this.stream = stream;
        this.emit('camera', {status});
        if (status === 'failed') this.emit('error', {error: new Error('Camera access was blocked. Allow Camera in your browser’s site settings, then try again.')});
      },
      onException: error => { if (this.active) this.emit('error', {error}); },
      onUpdate: ({processCpuResult}) => {
        if (!this.active || this.paused || !this.scene) return;
        const reality = processCpuResult?.reality;
        const tracking = reality?.trackingStatus === 'NORMAL';
        if (tracking !== this.tracking) {
          this.tracking = tracking;
          this.emit('tracking', {normal: tracking, reason: reality?.trackingReason});
        }
        if (!tracking) { this.clearCandidate(); return; }
        if (!this.placed) this.updateCandidate();
      },
      onPaused: () => {
        if (!this.active) return;
        this.paused = true;
        this.tracking = false;
        this.clearCandidate();
        this.emit('paused');
      },
      onResume: () => { this.paused = false; this.emit('resumed'); },
    };
  }

  resizeCanvas() {
    const {width, height} = this.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
  }

  initScene({scene, camera, renderer}) {
    this.scene = scene;
    this.camera = camera;
    this.content = new THREE.Group();
    scene.add(this.content);
    this.couch = createCouch(this.source);
    this.couch.setColor(this.color);
    this.couch.anchor.visible = false;
    this.content.add(this.couch.anchor);
    this.content.add(new THREE.HemisphereLight(0xfff7ea, 0x87939c, 2.5));
    const light = new THREE.DirectionalLight(0xfffaf1, 3);
    light.position.set(-3, 6, 4);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.left = -5;
    light.shadow.camera.right = 5;
    light.shadow.camera.top = 5;
    light.shadow.camera.bottom = -5;
    light.shadow.normalBias = 0.025;
    this.content.add(light);
    this.content.add(light.target);
    this.light = light;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({opacity: 0.24}));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.receiveShadow = true;
    this.shadow.visible = false;
    this.content.add(this.shadow);
    this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.135, 48), new THREE.MeshBasicMaterial({color: 0xff9900, side: THREE.DoubleSide, depthTest: false}));
    this.reticle.rotation.x = -Math.PI / 2;
    this.reticle.visible = false;
    this.content.add(this.reticle);
    camera.position.set(0, 1.6, 0);
    this.xr.XrController.updateCameraProjectionMatrix({origin: camera.position, facing: camera.quaternion});
  }

  updateCandidate() {
    const screenPoint = new THREE.Vector2(0, -0.18);
    // Absolute scale establishes a horizontal ground plane at y=0. Prefer a
    // ground-surface hit when available, otherwise intersect that estimated plane.
    const hits = this.xr.XrController.hitTest(0.5, 0.59, []);
    const surface = usableHit(hits, this.camera.position.y);
    let point = surface ? new THREE.Vector3(surface.position.x, 0, surface.position.z) : null;
    if (!point) {
      this.raycaster.setFromCamera(screenPoint, this.camera);
      if (this.raycaster.ray.direction.y < -0.12) point = this.raycaster.ray.intersectPlane(this.floor, new THREE.Vector3());
    }
    const distance = point?.distanceTo(this.camera.position);
    if (!point || distance < 0.5 || distance > 6 || this.camera.position.y < 0.3) { this.clearCandidate(); return; }
    this.steadyFrames = this.previousPoint && point.distanceTo(this.previousPoint) < 0.2 ? this.steadyFrames + 1 : 1;
    this.previousPoint = point.clone();
    this.reticle.position.copy(point).y = 0.008;
    this.reticle.visible = true;
    if (this.steadyFrames < 8) {
      if (this.candidate) { this.candidate = null; this.emit('placement', {ready: false}); }
      return;
    }
    const hadCandidate = Boolean(this.candidate);
    this.candidate = {position: point.clone(), timestamp: this.now()};
    if (!hadCandidate) this.emit('placement', {ready: true});
  }

  clearCandidate() {
    const wasReady = Boolean(this.candidate);
    this.candidate = null;
    this.previousPoint = null;
    this.steadyFrames = 0;
    if (this.reticle) this.reticle.visible = false;
    if (wasReady) this.emit('placement', {ready: false});
  }

  place() {
    if (!this.active || this.paused || !this.tracking || this.placed || !this.candidate
      || this.now() - this.candidate.timestamp > PLACEMENT_MAX_AGE_MS) return false;
    this.couch.anchor.position.copy(this.candidate.position);
    if (!this.hasPriorPlacement) {
      this.couch.anchor.rotation.y = Math.atan2(this.camera.position.x - this.candidate.position.x, this.camera.position.z - this.candidate.position.z);
    }
    this.couch.anchor.visible = true;
    this.shadow.position.set(this.candidate.position.x, 0.003, this.candidate.position.z);
    this.shadow.visible = true;
    this.light.position.set(this.candidate.position.x - 3, 6, this.candidate.position.z + 4);
    this.light.target.position.copy(this.candidate.position);
    this.placed = true;
    this.hasPriorPlacement = true;
    this.clearCandidate();
    this.emit('placed');
    return true;
  }

  reposition() {
    if (!this.active || this.paused || !this.placed) return;
    this.placed = false;
    this.clearCandidate();
    this.emit('moving');
  }

  cancelReposition() {
    if (!this.active || !this.hasPriorPlacement || this.placed) return;
    this.placed = true;
    this.clearCandidate();
    this.emit('placed');
  }

  setColor(key) { this.color = key; this.couch?.setColor(key); }

  rotate(direction) {
    if (this.active && !this.paused && this.tracking && this.placed) this.couch.anchor.rotation.y += direction * Math.PI / 12;
  }

  tappedCouch(clientX, clientY) {
    if (!this.placed || !this.camera) return false;
    const r = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1), this.camera);
    return this.raycaster.intersectObject(this.couch.anchor, true).length > 0;
  }

  pause() { if (this.active && !this.paused) this.xr.pause(); }
  resume() { if (this.active && this.paused) this.xr.resume(); }

  stop() {
    ++this.generation;
    this.active = false;
    this.paused = false;
    this.tracking = false;
    this.placed = false;
    this.hasPriorPlacement = false;
    this.clearCandidate();
    this.xr?.stop();
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.content?.removeFromParent();
    this.couch?.dispose();
    for (const mesh of [this.reticle, this.shadow]) { mesh?.geometry.dispose(); mesh?.material.dispose(); }
    this.light?.shadow.dispose();
    this.content = this.couch = this.reticle = this.shadow = this.scene = null;
  }
}
