import { ExponentialSmoother } from '@mabataki/core'
import { MediaPipeFaceTracker } from '@mabataki/mediapipe'
import type { FaceTrackingFrame } from '@mabataki/mediapipe'
import type { FaceFilterManifest, FaceFilterTrackingFrame } from '@mabataki/ar'
import {
  loadGltfFaceFilter,
  ThreeFaceFilterRenderer,
} from '@mabataki/three'
import {
  createBuiltinFilter,
  FILTERS,
} from './filter-assets'
import { faceFilterTrackingTarget } from './filter-tracking'

function $<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (element === null) throw new Error(`missing element: ${selector}`)
  return element
}

const cameraEl = $<HTMLButtonElement>('#camera')
const videoEl = $<HTMLVideoElement>('#camera-video')
const canvasEl = $<HTMLCanvasElement>('#filter-canvas')
const stageEl = $('#filter-stage')
const placeholderEl = $('#camera-placeholder')
const statusEl = $('#status')
const trackingStateEl = $('#tracking-state')
const trackingValuesEl = $('#tracking-values')
const activeFilterNameEl = $('#active-filter-name')
const filterTypeEl = $('#filter-type')
const manifestPreviewEl = $('#manifest-preview')
const filterFileEl = $<HTMLInputElement>('#filter-file')
const offsetXEl = $<HTMLInputElement>('#offset-x')
const offsetYEl = $<HTMLInputElement>('#offset-y')
const offsetZEl = $<HTMLInputElement>('#offset-z')
const scaleEl = $<HTMLInputElement>('#scale')
const offsetXValueEl = $<HTMLOutputElement>('#offset-x-value')
const offsetYValueEl = $<HTMLOutputElement>('#offset-y-value')
const offsetZValueEl = $<HTMLOutputElement>('#offset-z-value')
const scaleValueEl = $<HTMLOutputElement>('#scale-value')
const resetEl = $<HTMLButtonElement>('#reset')
const filterButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-filter]')]

const renderer = new ThreeFaceFilterRenderer(canvasEl)
const builtinManifests = new Map(FILTERS.map((manifest) => [
  manifest.id,
  structuredClone(manifest) as FaceFilterManifest,
]))
let activeManifest = builtinManifests.get(FILTERS[0].id)!
let faceTracker: MediaPipeFaceTracker | null = null
let lastVideoTime = -1
let lastFrameMs = 0
let importedUrl: string | null = null
const smoothers = {
  x: new ExponentialSmoother(22),
  y: new ExponentialSmoother(22),
  faceWidth: new ExponentialSmoother(24),
  yaw: new ExponentialSmoother(20),
  pitch: new ExponentialSmoother(24),
  roll: new ExponentialSmoother(20),
  mouthOpen: new ExponentialSmoother(42),
}

function resizeRenderer(): void {
  const bounds = stageEl.getBoundingClientRect()
  renderer.resize(bounds.width, bounds.height, window.devicePixelRatio)
}

function syncControls(): void {
  const [x, y, z] = activeManifest.transform.position
  offsetXEl.value = String(x)
  offsetYEl.value = String(y)
  offsetZEl.value = String(z)
  scaleEl.value = String(activeManifest.transform.scale)
  offsetXValueEl.value = x.toFixed(2)
  offsetYValueEl.value = y.toFixed(2)
  offsetZValueEl.value = z.toFixed(2)
  scaleValueEl.value = `${activeManifest.transform.scale.toFixed(2)}×`
  activeFilterNameEl.textContent = activeManifest.name
  filterTypeEl.textContent = activeManifest.kind === 'accessory' ? 'Accessory' : 'Full mask'
  const preview = importedUrl === null
    ? activeManifest
    : { ...activeManifest, asset: { ...activeManifest.asset, src: 'your-filter.glb' } }
  manifestPreviewEl.textContent = JSON.stringify(preview, null, 2)
}

function updatePlacement(): void {
  activeManifest.transform = {
    ...activeManifest.transform,
    position: [
      Number(offsetXEl.value),
      Number(offsetYEl.value),
      Number(offsetZEl.value),
    ],
    scale: Number(scaleEl.value),
  }
  syncControls()
}

async function selectBuiltinFilter(id: string): Promise<void> {
  const manifest = builtinManifests.get(id)
  if (manifest === undefined) return
  if (importedUrl !== null) {
    URL.revokeObjectURL(importedUrl)
    importedUrl = null
  }
  activeManifest = manifest
  renderer.setFilter(manifest, createBuiltinFilter(manifest.asset.src))
  for (const button of filterButtons) {
    button.classList.toggle('is-active', button.dataset.filter === id)
  }
  syncControls()
  statusEl.textContent = `${manifest.name} ready · start the camera to attach it`
}

function toFilterFrame(frame: FaceTrackingFrame, deltaMs: number): FaceFilterTrackingFrame {
  const target = faceFilterTrackingTarget(frame, activeManifest.trackingAnchor)
  return {
    x: smoothers.x.next(target.x, deltaMs),
    y: smoothers.y.next(target.y, deltaMs),
    faceWidth: smoothers.faceWidth.next(target.faceWidth, deltaMs),
    yaw: smoothers.yaw.next(target.yaw, deltaMs),
    pitch: smoothers.pitch.next(target.pitch, deltaMs),
    roll: smoothers.roll.next(target.roll, deltaMs),
    expressions: {
      ...frame.parameters,
      mouthOpen: smoothers.mouthOpen.next(frame.parameters.mouthOpen, deltaMs),
    },
  }
}

async function stopCamera(): Promise<void> {
  faceTracker?.close()
  faceTracker = null
  lastVideoTime = -1
  lastFrameMs = 0
  renderer.update(null)
  for (const smoother of Object.values(smoothers)) smoother.reset()
  cameraEl.textContent = 'Start camera'
  placeholderEl.hidden = false
  trackingStateEl.classList.remove('is-live')
  trackingStateEl.innerHTML = '<i></i>Camera off'
  trackingValuesEl.textContent = 'yaw 0.0° · pitch 0.0° · mouth 0.00'
  statusEl.textContent = 'Camera stopped · no video leaves this device'
}

cameraEl.addEventListener('click', async () => {
  if (faceTracker !== null) {
    await stopCamera()
    return
  }
  cameraEl.disabled = true
  cameraEl.textContent = 'Loading…'
  statusEl.textContent = 'Requesting camera access and loading MediaPipe…'
  try {
    faceTracker = await MediaPipeFaceTracker.create(videoEl)
    cameraEl.textContent = 'Stop camera'
    placeholderEl.hidden = true
    trackingStateEl.classList.add('is-live')
    trackingStateEl.innerHTML = '<i></i>Finding face'
    statusEl.textContent = 'Camera ready · look toward the screen'
  } catch (error) {
    await stopCamera()
    alert(`3D filter demo failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    cameraEl.disabled = false
  }
})

for (const button of filterButtons) {
  button.addEventListener('click', () => void selectBuiltinFilter(button.dataset.filter ?? ''))
}

filterFileEl.addEventListener('change', async () => {
  const file = filterFileEl.files?.[0]
  if (file === undefined) return
  const nextUrl = URL.createObjectURL(file)
  const manifest: FaceFilterManifest = {
    version: 1,
    id: `imported-${file.name}`,
    name: file.name.replace(/\.glb$/i, ''),
    kind: 'accessory',
    trackingAnchor: 'eyes',
    asset: { type: 'gltf', src: nextUrl },
    modelFaceWidth: 2,
    transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 1,
    },
    occlusion: 'none',
  }
  statusEl.textContent = `Loading ${file.name}…`
  try {
    const object = await loadGltfFaceFilter(manifest)
    if (importedUrl !== null) URL.revokeObjectURL(importedUrl)
    importedUrl = nextUrl
    activeManifest = manifest
    renderer.setFilter(manifest, object)
    for (const button of filterButtons) button.classList.remove('is-active')
    syncControls()
    statusEl.textContent = `${file.name} loaded · adjust its placement in face-width units`
  } catch (error) {
    URL.revokeObjectURL(nextUrl)
    alert(`GLB import failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    filterFileEl.value = ''
  }
})

for (const input of [offsetXEl, offsetYEl, offsetZEl, scaleEl]) {
  input.addEventListener('input', updatePlacement)
}

resetEl.addEventListener('click', () => {
  const original = FILTERS.find((manifest) => manifest.id === activeManifest.id)
  activeManifest.transform = original === undefined
    ? { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 }
    : structuredClone(original.transform)
  syncControls()
})

function tick(now: number): void {
  if (faceTracker !== null && videoEl.currentTime !== lastVideoTime) {
    lastVideoTime = videoEl.currentTime
    const deltaMs = lastFrameMs === 0 ? 0 : now - lastFrameMs
    lastFrameMs = now
    const tracked = faceTracker.sample(now)
    if (tracked === null) {
      renderer.update(null)
      trackingStateEl.innerHTML = '<i></i>Finding face'
    } else {
      const frame = toFilterFrame(tracked, deltaMs)
      renderer.update(frame)
      trackingStateEl.innerHTML = '<i></i>Tracking'
      trackingValuesEl.textContent =
        `yaw ${(frame.yaw * 180 / Math.PI).toFixed(1)}° · ` +
        `pitch ${(frame.pitch * 180 / Math.PI).toFixed(1)}° · ` +
        `mouth ${(frame.expressions.mouthOpen ?? 0).toFixed(2)}`
      statusEl.textContent = activeManifest.kind === 'accessory'
        ? '3D accessory · depth-only face occluder enabled'
        : 'Full-face mask · open your mouth to move the jaw'
    }
  }
  renderer.render()
  requestAnimationFrame(tick)
}

new ResizeObserver(resizeRenderer).observe(stageEl)
window.addEventListener('beforeunload', () => {
  faceTracker?.close()
  if (importedUrl !== null) URL.revokeObjectURL(importedUrl)
  renderer.destroy()
})

resizeRenderer()
await selectBuiltinFilter(activeManifest.id)
requestAnimationFrame(tick)
