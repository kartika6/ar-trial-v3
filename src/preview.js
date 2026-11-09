import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createCouch} from './couch.js';

export function createPreview(canvas, source) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 30);
  camera.position.set(3.3, 2.1, 5);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.55, 0);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.minPolarAngle = 0.4;
  controls.maxPolarAngle = Math.PI / 2;
  controls.update();
  scene.add(new THREE.HemisphereLight(0xfff5e5, 0x9babbc, 3.0));
  const light = new THREE.DirectionalLight(0xfff8ec, 3.2);
  light.position.set(-3, 5, 4);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.camera.left = -3;
  light.shadow.camera.right = 3;
  light.shadow.camera.top = 3;
  light.shadow.camera.bottom = -3;
  light.shadow.normalBias = 0.025;
  scene.add(light);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.ShadowMaterial({opacity: 0.3}));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const couch = createCouch(source);
  scene.add(couch.anchor);
  let enabled = true;
  const draw = () => { if (enabled) renderer.render(scene, camera); };
  controls.addEventListener('change', draw);
  const resize = () => {
    const {width, height} = canvas.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    draw();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();
  return {
    setColor(key) { couch.setColor(key); draw(); },
    setEnabled(value) { enabled = value; controls.enabled = value; if (value) resize(); },
  };
}
