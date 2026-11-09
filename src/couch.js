import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {COLORS, PRODUCT} from './config.js';

let sourcePromise;

export function loadCouch() {
  sourcePromise ??= new GLTFLoader().loadAsync(new URL('models/couch.glb', document.baseURI).href)
    .then(gltf => gltf.scene)
    .catch(error => { sourcePromise = undefined; throw error; });
  return sourcePromise;
}

export function createCouch(source) {
  const model = source.clone(true);
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = new THREE.Vector3(PRODUCT.width / size.x, PRODUCT.height / size.y, PRODUCT.depth / size.z);
  model.scale.multiply(scale);
  model.position.set(-center.x * scale.x, -bounds.min.y * scale.y, -center.z * scale.z);
  const materials = [];
  const copies = new Map();
  model.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const cloneMaterial = original => {
      if (!copies.has(original)) {
        const material = original.clone();
        copies.set(original, material);
        // The supplied model's two named materials are its upholstery and cushions.
        if (['Red', 'DarkRed'].includes(material.name)) {
          materials.push({material, original: material.color.clone()});
        }
      }
      return copies.get(original);
    };
    object.material = Array.isArray(object.material) ? object.material.map(cloneMaterial) : cloneMaterial(object.material);
  });
  const anchor = new THREE.Group();
  anchor.name = 'couch-placement';
  anchor.add(model);
  return {
    anchor,
    setColor(key) {
      if (!COLORS[key]) return;
      for (const {material, original} of materials) {
        if (key === 'original') material.color.copy(original);
        else {
          material.color.set(COLORS[key].hex);
          if (material.name === 'DarkRed') material.color.multiplyScalar(0.66);
        }
      }
    },
    dispose() { for (const material of copies.values()) material.dispose(); },
  };
}
