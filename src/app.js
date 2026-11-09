import {COLORS} from './config.js';
import {loadCouch} from './couch.js';
import {createPreview} from './preview.js';
import {ArSession, requestMotionAccess} from './ar-session.js';

const $ = selector => document.querySelector(selector);
const state = {stage: 'preview', color: 'original', palette: false, size: false, canPlace: false, tracking: false, moving: false, starting: false};
let source, preview, ar, startGeneration = 0;
const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function announce(message) { $('#announcement').textContent = message; }

function render() {
  const live = ['starting', 'placing', 'placed', 'paused'].includes(state.stage);
  $('#app').dataset.stage = state.stage;
  $('#preview-scene').hidden = live;
  $('#camera-canvas').hidden = !live;
  preview?.setEnabled(!live);
  $('#welcome-panel').hidden = state.stage !== 'preview' || state.palette;
  $('#placement-panel').hidden = !['starting', 'placing'].includes(state.stage);
  $('#couch-controls').hidden = state.stage !== 'placed' || state.palette;
  $('#color-palette').hidden = !state.palette || !['preview', 'placed'].includes(state.stage);
  $('#error-panel').hidden = state.stage !== 'error';
  $('#paused-panel').hidden = state.stage !== 'paused';
  $('#close-camera').hidden = !live;
  $('#mode-label').textContent = live ? (state.stage === 'starting' ? 'Opening camera' : 'Live camera') : '3D preview';
  $('#preview-hint').hidden = live || state.palette || state.stage === 'error';
  $('#tracking-status').hidden = !['placing', 'placed'].includes(state.stage);
  $('#scan-guide').hidden = state.stage !== 'placing' || state.canPlace;
  $('#place-couch').disabled = !state.canPlace || state.stage !== 'placing';
  $('#place-couch').textContent = state.stage === 'starting' ? 'Opening camera…' : state.canPlace ? (state.moving ? 'Move couch here' : 'Place couch') : 'Finding the floor…';
  $('#placement-title').textContent = state.canPlace ? 'Choose your spot' : 'Find your floor';
  $('#placement-help').textContent = state.stage === 'starting' ? 'Allow Camera and Motion access when your browser asks.' : state.canPlace ? 'Aim the orange ring where you want the couch.' : 'Point at the floor and move your phone slowly forward and back.';
  $('#cancel-move').hidden = !state.moving;
  $('#selected-color').textContent = COLORS[state.color].name;
  $('#palette-color').textContent = COLORS[state.color].name;
  $('#selected-dot').style.backgroundColor = COLORS[state.color].hex;
  $('#size-details').hidden = !state.size;
  $('#show-size').setAttribute('aria-expanded', String(state.size));
  $('#open-colors').setAttribute('aria-expanded', String(state.palette));
  document.querySelectorAll('[data-color]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.color === state.color)));
  for (const id of ['move-couch', 'rotate-left', 'rotate-right']) $(`#${id}`).disabled = !state.tracking;
  if (state.stage === 'placed') $('#tracking-status').textContent = state.tracking ? 'Couch placed' : 'Tracking lost. Move slowly back toward your couch.';
  else if (state.stage === 'placing') $('#tracking-status').textContent = state.canPlace ? 'Floor estimate ready' : 'Move slowly to find the floor';
}

function showError(error) {
  console.error('AR session:', error);
  ar?.stop();
  state.stage = 'error';
  state.palette = false;
  state.canPlace = false;
  state.starting = false;
  $('#error-title').textContent = !mobile ? 'Open this on your phone' : 'Camera couldn’t start';
  const detail = String(error?.message || error || '');
  $('#error-message').textContent = detail.includes('NotAllowed') || error?.name === 'NotAllowedError'
    ? 'Allow Camera and Motion & Orientation in your browser’s site settings, then try again.'
    : detail.includes('NotFound') || error?.name === 'NotFoundError'
      ? 'No rear camera was found. Open this page in Safari on an iPhone or Chrome on an Android phone.'
      : /^(The AR files|Motion access|Camera access|Camera access needs|This browser|Use Safari|Your couch)/.test(detail)
        ? detail
        : 'Room tracking couldn’t start. Open this link directly in Safari on iPhone or Chrome on Android, close other apps using your camera, and try again.';
  $('#retry-camera').hidden = !mobile;
  render();
}

function backToPreview() {
  ++startGeneration;
  ar?.stop();
  Object.assign(state, {stage: 'preview', palette: false, size: false, canPlace: false, tracking: false, moving: false, starting: false});
  render();
  $('#start-camera').focus();
}

async function startCamera() {
  if (state.starting) return;
  const generation = ++startGeneration;
  if (!window.isSecureContext) { showError(new Error('Camera access needs HTTPS. Open the published link in your phone’s browser.')); return; }
  if (!mobile) { showError(new Error('Use Safari on iPhone or Chrome on Android for room tracking. You can explore the 3D couch and colors on this device.')); return; }
  if (!navigator.mediaDevices?.getUserMedia) { showError(new Error('This browser cannot access the camera. Open the link directly in Safari on iPhone or Chrome on Android.')); return; }
  // Start these permission requests synchronously within the button gesture.
  const motionPermission = requestMotionAccess();
  Object.assign(state, {stage: 'starting', starting: true, palette: false, canPlace: false, tracking: false, moving: false});
  render();
  try {
    await ar.start(motionPermission);
    if (generation !== startGeneration) return;
    state.starting = false;
  } catch (error) { if (generation === startGeneration) showError(error); }
}

function openPalette() {
  if (!source || !['preview', 'placed'].includes(state.stage)) return;
  state.palette = true;
  render();
  $('.swatch[aria-pressed=true]').focus();
}

function closePalette() {
  state.palette = false;
  render();
  (state.stage === 'placed' ? $('#open-colors') : $('#preview-colors')).focus();
}

$('#start-camera').addEventListener('click', startCamera);
$('#retry-camera').addEventListener('click', startCamera);
$('#close-camera').addEventListener('click', backToPreview);
$('#back-preview').addEventListener('click', backToPreview);
$('#open-colors').addEventListener('click', openPalette);
$('#preview-colors').addEventListener('click', openPalette);
$('#done-colors').addEventListener('click', closePalette);
$('#place-couch').addEventListener('click', () => {
  if (!ar?.place()) { state.canPlace = false; render(); announce('Keep pointing at the floor until the orange ring is steady.'); }
});
$('#move-couch').addEventListener('click', () => ar?.reposition());
$('#cancel-move').addEventListener('click', () => ar?.cancelReposition());
$('#rotate-left').addEventListener('click', () => ar?.rotate(-1));
$('#rotate-right').addEventListener('click', () => ar?.rotate(1));
$('#show-size').addEventListener('click', () => { state.size = !state.size; render(); });
$('#resume-camera').addEventListener('click', () => { try { ar?.resume(); } catch (error) { showError(error); } });
document.querySelectorAll('[data-color]').forEach(button => button.addEventListener('click', () => {
  state.color = button.dataset.color;
  preview?.setColor(state.color);
  ar?.setColor(state.color);
  render();
  announce(`${COLORS[state.color].name} selected.${state.stage === 'placed' ? ' Couch position and size are unchanged.' : ''}`);
}));
$('#camera-canvas').addEventListener('click', event => {
  if (state.palette) closePalette();
  else if (ar?.tappedCouch(event.clientX, event.clientY)) openPalette();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && state.palette) closePalette(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) ar?.pause(); });
window.addEventListener('pagehide', () => ar?.stop());
window.addEventListener('resize', () => { if (ar?.active) ar.resizeCanvas(); });

try {
  source = await loadCouch();
  preview = createPreview($('#preview-canvas'), source);
  ar = new ArSession($('#camera-canvas'), source);
  ar.addEventListener('started', () => { state.stage = 'placing'; state.starting = false; render(); });
  ar.addEventListener('tracking', ({detail}) => { state.tracking = detail.normal; if (!detail.normal) state.canPlace = false; render(); });
  ar.addEventListener('placement', ({detail}) => { state.canPlace = detail.ready; render(); });
  ar.addEventListener('placed', () => { Object.assign(state, {stage: 'placed', canPlace: false, moving: false}); render(); $('#open-colors').focus(); announce('Couch placed. Open Color to compare finishes.'); });
  ar.addEventListener('moving', () => { Object.assign(state, {stage: 'placing', canPlace: false, palette: false, moving: true}); render(); });
  ar.addEventListener('paused', () => { state.stage = 'paused'; state.palette = false; state.canPlace = false; render(); });
  ar.addEventListener('resumed', () => { state.stage = ar.placed ? 'placed' : 'placing'; state.tracking = false; render(); });
  ar.addEventListener('error', ({detail}) => {
    const generation = ar.generation;
    queueMicrotask(() => { if (ar.active && ar.generation === generation) showError(detail.error); });
  });
  $('#start-camera').disabled = false;
  $('#start-camera').textContent = 'Start camera';
  $('#preview-colors').disabled = false;
  render();
} catch (error) {
  showError(new Error(`Your couch could not load. Check your connection and reload this page. ${error.message || ''}`));
  $('#retry-camera').hidden = true;
  $('#back-preview').textContent = 'Reload page';
  $('#back-preview').addEventListener('click', () => location.reload(), {once: true});
}
