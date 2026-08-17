import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Texture,
} from 'pixi.js'
import { ExponentialSmoother, loadModel, MabatakiRuntime } from '@mabataki/core'
import {
  confidenceToAlpha,
  estimateEyeAccessoryAnchor,
  FACE_MESH_CONNECTIONS,
  MediaPipeFaceTracker,
  MediaPipePersonSegmenter,
} from '@mabataki/mediapipe'
import type { FaceTrackingFrame, NormalizedLandmark, PersonMask } from '@mabataki/mediapipe'
import { PixiAvatarRenderer } from '@mabataki/pixi'

const MODEL_URL = '/models/character/model.json'
const GLASSES_URL = '/models/character/glasses.svg'
const DEFAULT_WIDTH = 640
const DEFAULT_HEIGHT = 480
const MODEL_WIDTH = 403
const MODEL_HEIGHT = 475
const MODEL_HEAD_X = 259
const MODEL_HEAD_Y = 80
const MODEL_FACE_WIDTH = 260
const MODEL_EYE_SPAN = 104
const SMOOTHING_TIME_MS = 70
const PLACEMENT_SMOOTHING_TIME_MS = 24
const SEGMENTATION_INTERVAL_MS = 1000 / 15

type CompositorMode = 'accessory' | 'avatar-overlay' | 'avatar-background'

interface PlacementAdjustment {
  offsetX: number
  offsetY: number
  scale: number
}

function defaultPlacementAdjustment(): PlacementAdjustment {
  return { offsetX: 0, offsetY: 0, scale: 1 }
}

function $<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (element === null) throw new Error(`missing element: ${selector}`)
  return element
}

function canvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('2D canvas is unavailable')
  return context
}

const stageHost = $('#stage')
const statusEl = $('#status')
const modeEl = $<HTMLSelectElement>('#mode')
const cameraEl = $<HTMLButtonElement>('#camera')
const videoEl = $<HTMLVideoElement>('#camera-video')
const placementXEl = $<HTMLInputElement>('#placement-x')
const placementYEl = $<HTMLInputElement>('#placement-y')
const placementScaleEl = $<HTMLInputElement>('#placement-scale')
const placementXValueEl = $<HTMLOutputElement>('#placement-x-value')
const placementYValueEl = $<HTMLOutputElement>('#placement-y-value')
const placementScaleValueEl = $<HTMLOutputElement>('#placement-scale-value')
const placementResetEl = $<HTMLButtonElement>('#placement-reset')
const showFaceMeshEl = $<HTMLInputElement>('#show-face-mesh')

const app = new Application()
await app.init({
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT,
  background: '#10131d',
  antialias: true,
})
stageHost.append(app.canvas)

const backdrop = new Graphics()
const avatar = new Container()
app.stage.addChild(backdrop)

let videoSprite: Sprite | null = null
app.stage.addChild(avatar)

const foregroundCanvas = document.createElement('canvas')
foregroundCanvas.width = DEFAULT_WIDTH
foregroundCanvas.height = DEFAULT_HEIGHT
const foregroundContext = canvasContext(foregroundCanvas)
const foregroundTexture = Texture.from(foregroundCanvas)
const foregroundSprite = new Sprite(foregroundTexture)
foregroundSprite.visible = false
app.stage.addChild(foregroundSprite)

const accessoryTexture = await Assets.load<Texture>(GLASSES_URL)
const accessory = new Sprite(accessoryTexture)
accessory.pivot.set(MODEL_HEAD_X, MODEL_HEAD_Y)
accessory.visible = false
app.stage.addChild(accessory)
const faceMeshOverlay = new Graphics()
faceMeshOverlay.visible = false
app.stage.addChild(faceMeshOverlay)

const model = await loadModel(MODEL_URL)
const modelBaseUrl = new URL(MODEL_URL, location.href)
const modelTextures = await Promise.all(model.parts.map((part) =>
  Assets.load<Texture>(new URL(part.texture, modelBaseUrl).href),
))
const runtime = new MabatakiRuntime(model)
const avatarRenderer = new PixiAvatarRenderer(runtime, modelTextures)
avatar.addChild(avatarRenderer.container)

let faceTracker: MediaPipeFaceTracker | null = null
let personSegmenter: MediaPipePersonSegmenter | null = null
let segmenterPromise: Promise<MediaPipePersonSegmenter> | null = null
let lastVideoTime = -1
let lastFrameMs = 0
let lastSegmentationMs = -Infinity
let hasTrackedFace = false
let sceneWidth = DEFAULT_WIDTH
let sceneHeight = DEFAULT_HEIGHT
let currentView = { x: 0.5, y: 0.35, faceWidth: 0.35, rotation: 0 }
let currentAccessoryAnchor = { x: 0.5, y: 0.35, eyeSpan: 0.18, rotation: 0 }
const placementByMode: Record<CompositorMode, PlacementAdjustment> = {
  accessory: defaultPlacementAdjustment(),
  'avatar-overlay': defaultPlacementAdjustment(),
  'avatar-background': defaultPlacementAdjustment(),
}
const parameterSmoothers = new Map(model.parameters.map((parameter) => [
  parameter.id,
  new ExponentialSmoother(SMOOTHING_TIME_MS),
]))
const viewSmoothers = {
  x: new ExponentialSmoother(PLACEMENT_SMOOTHING_TIME_MS),
  y: new ExponentialSmoother(PLACEMENT_SMOOTHING_TIME_MS),
  faceWidth: new ExponentialSmoother(PLACEMENT_SMOOTHING_TIME_MS),
  rotation: new ExponentialSmoother(PLACEMENT_SMOOTHING_TIME_MS),
}
const accessorySmoothers = {
  x: new ExponentialSmoother(PLACEMENT_SMOOTHING_TIME_MS),
  y: new ExponentialSmoother(PLACEMENT_SMOOTHING_TIME_MS),
  eyeSpan: new ExponentialSmoother(PLACEMENT_SMOOTHING_TIME_MS),
  rotation: new ExponentialSmoother(PLACEMENT_SMOOTHING_TIME_MS),
}
const maskCanvas = document.createElement('canvas')
const maskContext = canvasContext(maskCanvas)

function activeMode(): CompositorMode {
  return modeEl.value as CompositorMode
}

function syncPlacementControls(): void {
  const placement = placementByMode[activeMode()]
  placementXEl.value = String(placement.offsetX)
  placementYEl.value = String(placement.offsetY)
  placementScaleEl.value = String(placement.scale)
  placementXValueEl.value = `${placement.offsetX}%`
  placementYValueEl.value = `${placement.offsetY}%`
  placementScaleValueEl.value = `${placement.scale.toFixed(2)}×`
}

function updateActivePlacement(): void {
  const placement = placementByMode[activeMode()]
  placement.offsetX = placementXEl.valueAsNumber
  placement.offsetY = placementYEl.valueAsNumber
  placement.scale = placementScaleEl.valueAsNumber
  syncPlacementControls()
  layoutTrackedObjects()
}

function drawBackdrop(): void {
  backdrop.clear()
  backdrop.rect(0, 0, sceneWidth, sceneHeight).fill('#151b2c')
  backdrop.circle(sceneWidth * 0.18, sceneHeight * 0.18, sceneHeight * 0.32).fill('#29345a')
  backdrop.circle(sceneWidth * 0.88, sceneHeight * 0.82, sceneHeight * 0.42).fill('#263f42')
}

function layoutVideoSprite(): void {
  if (videoSprite === null) return
  videoSprite.anchor.set(0.5)
  videoSprite.position.set(sceneWidth / 2, sceneHeight / 2)
  videoSprite.width = sceneWidth
  videoSprite.height = sceneHeight
  videoSprite.scale.x = -Math.abs(videoSprite.scale.x)
}

function resizeScene(width: number, height: number): void {
  sceneWidth = Math.max(1, width)
  sceneHeight = Math.max(1, height)
  app.renderer.resize(sceneWidth, sceneHeight)
  foregroundCanvas.width = sceneWidth
  foregroundCanvas.height = sceneHeight
  foregroundTexture.source.update()
  foregroundSprite.width = sceneWidth
  foregroundSprite.height = sceneHeight
  drawBackdrop()
  layoutVideoSprite()
  layoutTrackedObjects()
}

function layoutTrackedObjects(): void {
  const mode = activeMode()
  const placement = placementByMode[mode]
  const offsetX = placement.offsetX / 100 * sceneWidth
  const offsetY = placement.offsetY / 100 * sceneHeight
  const faceX = currentView.x * sceneWidth + offsetX
  const faceY = currentView.y * sceneHeight + offsetY
  const faceWidth = currentView.faceWidth * sceneWidth

  if (mode === 'accessory') {
    accessory.position.set(
      currentAccessoryAnchor.x * sceneWidth + offsetX,
      currentAccessoryAnchor.y * sceneHeight + offsetY,
    )
    accessory.scale.set(
      currentAccessoryAnchor.eyeSpan * sceneWidth / MODEL_EYE_SPAN * placement.scale,
    )
    accessory.rotation = currentAccessoryAnchor.rotation
  } else if (mode === 'avatar-overlay') {
    avatar.pivot.set(MODEL_HEAD_X, MODEL_HEAD_Y)
    avatar.position.set(faceX, faceY)
    avatar.scale.set(faceWidth / MODEL_FACE_WIDTH * placement.scale)
  } else {
    avatar.pivot.set(MODEL_WIDTH / 2, MODEL_HEIGHT / 2)
    avatar.position.set(sceneWidth * 0.76 + offsetX, sceneHeight * 0.53 + offsetY)
    const scale = Math.min(sceneWidth / MODEL_WIDTH, sceneHeight / MODEL_HEIGHT) *
      0.76 * placement.scale
    avatar.scale.set(scale)
  }
}

function syncMode(): void {
  const mode = activeMode()
  backdrop.visible = mode === 'avatar-background'
  if (videoSprite !== null) {
    videoSprite.visible = faceTracker !== null && mode !== 'avatar-background'
  }
  avatar.visible = mode === 'avatar-background' || (mode === 'avatar-overlay' && hasTrackedFace)
  foregroundSprite.visible = mode === 'avatar-background' && faceTracker !== null
  accessory.visible = mode === 'accessory' && hasTrackedFace
  faceMeshOverlay.visible = showFaceMeshEl.checked && faceTracker !== null
  layoutTrackedObjects()
}

function drawFaceMesh(landmarks: NormalizedLandmark[]): void {
  faceMeshOverlay.clear()
  if (!showFaceMeshEl.checked) return

  for (const connection of FACE_MESH_CONNECTIONS) {
    const start = landmarks[connection.start]
    const end = landmarks[connection.end]
    if (start === undefined || end === undefined) continue
    faceMeshOverlay
      .moveTo((1 - start.x) * sceneWidth, start.y * sceneHeight)
      .lineTo((1 - end.x) * sceneWidth, end.y * sceneHeight)
  }
  faceMeshOverlay.stroke({ color: '#67e8f9', width: 0.75, alpha: 0.38 })

  for (const landmark of landmarks) {
    faceMeshOverlay.circle((1 - landmark.x) * sceneWidth, landmark.y * sceneHeight, 1.25)
  }
  faceMeshOverlay.fill({ color: '#d1fae5', alpha: 0.82 })
}

function renderVertices(): void {
  avatarRenderer.render()
}

function updateTracking(frame: FaceTrackingFrame, deltaMs: number): void {
  if (!hasTrackedFace) {
    hasTrackedFace = true
    syncMode()
  }
  const smoothed = Object.fromEntries(Object.entries(frame.parameters).map(([id, value]) => [
    id,
    parameterSmoothers.get(id)?.next(value, deltaMs) ?? value,
  ]))
  runtime.update(smoothed)
  currentView = {
    x: viewSmoothers.x.next(frame.viewTransform.x, deltaMs),
    y: viewSmoothers.y.next(frame.viewTransform.y, deltaMs),
    faceWidth: viewSmoothers.faceWidth.next(frame.viewTransform.faceWidth, deltaMs),
    rotation: viewSmoothers.rotation.next(frame.viewTransform.rotation, deltaMs),
  }
  const accessoryAnchor = estimateEyeAccessoryAnchor(frame.landmarks)
  if (accessoryAnchor !== null) {
    currentAccessoryAnchor = {
      x: accessorySmoothers.x.next(accessoryAnchor.x, deltaMs),
      y: accessorySmoothers.y.next(accessoryAnchor.y, deltaMs),
      eyeSpan: accessorySmoothers.eyeSpan.next(accessoryAnchor.eyeSpan, deltaMs),
      rotation: accessorySmoothers.rotation.next(accessoryAnchor.rotation, deltaMs),
    }
  }
  drawFaceMesh(frame.landmarks)
  layoutTrackedObjects()
  statusEl.textContent =
    `tracking · yaw ${frame.parameters.headYaw.toFixed(2)} · ` +
    `roll ${frame.parameters.headRoll.toFixed(2)} · mouth ${frame.parameters.mouthOpen.toFixed(2)}` +
    (showFaceMeshEl.checked ? ` · mesh ${frame.landmarks.length}` : '')
}

function updateForeground(mask: PersonMask): void {
  if (maskCanvas.width !== mask.width || maskCanvas.height !== mask.height) {
    maskCanvas.width = mask.width
    maskCanvas.height = mask.height
  }
  const pixels = maskContext.createImageData(mask.width, mask.height)
  for (let source = 0, target = 0; source < mask.confidence.length; source++, target += 4) {
    pixels.data[target] = 255
    pixels.data[target + 1] = 255
    pixels.data[target + 2] = 255
    pixels.data[target + 3] = confidenceToAlpha(mask.confidence[source])
  }
  maskContext.putImageData(pixels, 0, 0)

  foregroundContext.clearRect(0, 0, sceneWidth, sceneHeight)
  foregroundContext.save()
  foregroundContext.translate(sceneWidth, 0)
  foregroundContext.scale(-1, 1)
  foregroundContext.drawImage(videoEl, 0, 0, sceneWidth, sceneHeight)
  foregroundContext.restore()
  foregroundContext.save()
  foregroundContext.globalCompositeOperation = 'destination-in'
  foregroundContext.translate(sceneWidth, 0)
  foregroundContext.scale(-1, 1)
  foregroundContext.drawImage(maskCanvas, 0, 0, sceneWidth, sceneHeight)
  foregroundContext.restore()
  foregroundTexture.source.update()
}

async function ensurePersonSegmenter(): Promise<MediaPipePersonSegmenter> {
  if (personSegmenter !== null) return personSegmenter
  segmenterPromise ??= MediaPipePersonSegmenter.create()
  try {
    personSegmenter = await segmenterPromise
    return personSegmenter
  } finally {
    segmenterPromise = null
  }
}

async function stopCamera(): Promise<void> {
  faceTracker?.close()
  faceTracker = null
  personSegmenter?.close()
  personSegmenter = null
  lastVideoTime = -1
  lastFrameMs = 0
  lastSegmentationMs = -Infinity
  hasTrackedFace = false
  faceMeshOverlay.clear()
  for (const smoother of parameterSmoothers.values()) smoother.reset()
  for (const smoother of Object.values(viewSmoothers)) smoother.reset()
  for (const smoother of Object.values(accessorySmoothers)) smoother.reset()
  if (videoSprite !== null) {
    app.stage.removeChild(videoSprite)
    videoSprite.destroy()
    videoSprite = null
  }
  cameraEl.textContent = 'start camera'
  statusEl.textContent = 'camera off'
  syncMode()
}

cameraEl.addEventListener('click', async () => {
  if (faceTracker !== null) {
    await stopCamera()
    return
  }
  cameraEl.disabled = true
  cameraEl.textContent = 'loading…'
  statusEl.textContent = 'requesting camera access…'
  try {
    faceTracker = await MediaPipeFaceTracker.create(videoEl)
    const width = videoEl.videoWidth || DEFAULT_WIDTH
    const height = videoEl.videoHeight || DEFAULT_HEIGHT
    videoSprite = new Sprite(Texture.from(videoEl))
    app.stage.addChildAt(videoSprite, 1)
    resizeScene(width, height)
    if (activeMode() === 'avatar-background') {
      statusEl.textContent = 'loading person segmentation…'
      await ensurePersonSegmenter()
    }
    cameraEl.textContent = 'stop camera'
    statusEl.textContent = 'looking for a face…'
    syncMode()
  } catch (error) {
    await stopCamera()
    alert(`Camera compositor failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    cameraEl.disabled = false
  }
})

modeEl.addEventListener('change', () => {
  syncPlacementControls()
  syncMode()
  if (activeMode() === 'avatar-background' && faceTracker !== null) {
    statusEl.textContent = 'loading person segmentation…'
    void ensurePersonSegmenter().then(() => {
      statusEl.textContent = 'person segmentation ready'
    }).catch((error) => {
      statusEl.textContent = `segmentation failed: ${error instanceof Error ? error.message : String(error)}`
    })
  }
})

placementXEl.addEventListener('input', updateActivePlacement)
placementYEl.addEventListener('input', updateActivePlacement)
placementScaleEl.addEventListener('input', updateActivePlacement)
placementResetEl.addEventListener('click', () => {
  placementByMode[activeMode()] = defaultPlacementAdjustment()
  syncPlacementControls()
  layoutTrackedObjects()
})
showFaceMeshEl.addEventListener('change', () => {
  if (!showFaceMeshEl.checked) faceMeshOverlay.clear()
  syncMode()
})

app.ticker.add((ticker) => {
  if (faceTracker !== null && videoEl.currentTime !== lastVideoTime) {
    lastVideoTime = videoEl.currentTime
    const now = performance.now()
    const deltaMs = lastFrameMs === 0 ? 0 : now - lastFrameMs
    lastFrameMs = now
    const frame = faceTracker.sample(now)
    if (frame !== null) updateTracking(frame, deltaMs)

    if (
      activeMode() === 'avatar-background' &&
      personSegmenter !== null &&
      now - lastSegmentationMs >= SEGMENTATION_INTERVAL_MS
    ) {
      const mask = personSegmenter.sample(videoEl, now)
      if (mask !== null) updateForeground(mask)
      lastSegmentationMs = now
    }
  }
  runtime.step(ticker.deltaMS)
  renderVertices()
})

drawBackdrop()
syncPlacementControls()
layoutTrackedObjects()
syncMode()
renderVertices()
statusEl.textContent = `model ready · ${model.parts.length} parts · select a mode and start the camera`
