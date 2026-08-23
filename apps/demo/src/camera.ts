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
  estimateEyeAccessoryAnchor,
  FACE_MESH_CONNECTIONS,
  MediaPipeFaceTracker,
} from '@mabataki/mediapipe'
import type { FaceTrackingFrame, NormalizedLandmark } from '@mabataki/mediapipe'
import { PixiAvatarRenderer } from '@mabataki/pixi'

const MODEL_URL = '/models/character/model.json'
const GLASSES_URL = '/models/character/glasses.svg'
const DEFAULT_WIDTH = 640
const DEFAULT_HEIGHT = 480
const MODEL_HEAD_X = 284.5
const MODEL_HEAD_Y = 253.3
const MODEL_FACE_WIDTH = 455
const ACCESSORY_PIVOT_X = 259
const ACCESSORY_PIVOT_Y = 80
const ACCESSORY_EYE_SPAN = 104
const SMOOTHING_TIME_MS = 70
const PLACEMENT_SMOOTHING_TIME_MS = 24

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
const backgroundInputEl = $<HTMLInputElement>('#background-input')

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
let backgroundSprite: Sprite | null = null
app.stage.addChild(avatar)

const accessoryTexture = await Assets.load<Texture>(GLASSES_URL)
const accessory = new Sprite(accessoryTexture)
accessory.pivot.set(ACCESSORY_PIVOT_X, ACCESSORY_PIVOT_Y)
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
const modelWidth = Math.max(1, ...modelTextures.map((texture) => texture.width))
const modelHeight = Math.max(1, ...modelTextures.map((texture) => texture.height))
const runtime = new MabatakiRuntime(model)
const avatarRenderer = new PixiAvatarRenderer(runtime, modelTextures)
avatar.addChild(avatarRenderer.container)

let faceTracker: MediaPipeFaceTracker | null = null
let lastVideoTime = -1
let lastFrameMs = 0
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

function layoutBackgroundSprite(): void {
  if (backgroundSprite === null) return
  const width = backgroundSprite.texture.width
  const height = backgroundSprite.texture.height
  if (width <= 0 || height <= 0) return
  backgroundSprite.anchor.set(0.5)
  backgroundSprite.position.set(sceneWidth / 2, sceneHeight / 2)
  backgroundSprite.scale.set(Math.max(sceneWidth / width, sceneHeight / height))
}

function resizeScene(width: number, height: number): void {
  sceneWidth = Math.max(1, width)
  sceneHeight = Math.max(1, height)
  app.renderer.resize(sceneWidth, sceneHeight)
  drawBackdrop()
  layoutVideoSprite()
  layoutBackgroundSprite()
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
      currentAccessoryAnchor.eyeSpan * sceneWidth / ACCESSORY_EYE_SPAN * placement.scale,
    )
    accessory.rotation = currentAccessoryAnchor.rotation
  } else if (mode === 'avatar-overlay') {
    avatar.pivot.set(MODEL_HEAD_X, MODEL_HEAD_Y)
    avatar.position.set(faceX, faceY)
    avatar.scale.set(faceWidth / MODEL_FACE_WIDTH * placement.scale)
  } else {
    avatar.pivot.set(modelWidth / 2, modelHeight / 2)
    avatar.position.set(sceneWidth * 0.76 + offsetX, sceneHeight * 0.53 + offsetY)
    const scale = Math.min(sceneWidth / modelWidth, sceneHeight / modelHeight) *
      0.76 * placement.scale
    avatar.scale.set(scale)
  }
}

function syncMode(): void {
  const mode = activeMode()
  backdrop.visible = mode === 'avatar-background' && backgroundSprite === null
  if (backgroundSprite !== null) {
    backgroundSprite.visible = mode === 'avatar-background'
  }
  if (videoSprite !== null) {
    videoSprite.visible = faceTracker !== null && mode !== 'avatar-background'
  }
  avatar.visible = mode === 'avatar-background' || (mode === 'avatar-overlay' && hasTrackedFace)
  accessory.visible = mode === 'accessory' && hasTrackedFace
  faceMeshOverlay.visible = showFaceMeshEl.checked && faceTracker !== null
  backgroundInputEl.disabled = mode !== 'avatar-background'
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

async function stopCamera(): Promise<void> {
  faceTracker?.close()
  faceTracker = null
  lastVideoTime = -1
  lastFrameMs = 0
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
  statusEl.textContent = activeMode() === 'avatar-background'
    ? 'background + avatar ready · camera is optional for tracking'
    : 'camera off'
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
  if (activeMode() === 'avatar-background' && faceTracker === null) {
    statusEl.textContent = 'background + avatar ready · camera is optional for tracking'
  }
})

backgroundInputEl.addEventListener('change', async () => {
  const file = backgroundInputEl.files?.[0]
  if (file === undefined) return
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const next = new Sprite(Texture.from(image))
    next.visible = false
    app.stage.addChildAt(next, 1)
    const previous = backgroundSprite
    backgroundSprite = next
    if (previous !== null) {
      const previousTexture = previous.texture
      app.stage.removeChild(previous)
      previous.destroy()
      previousTexture.destroy(true)
    }
    layoutBackgroundSprite()
    syncMode()
    statusEl.textContent = `background loaded · ${file.name}`
  } catch (error) {
    alert(`Background load failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    URL.revokeObjectURL(url)
    backgroundInputEl.value = ''
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
  }
  runtime.step(ticker.deltaMS)
  renderVertices()
})

drawBackdrop()
syncPlacementControls()
layoutTrackedObjects()
syncMode()
renderVertices()
statusEl.textContent = `model ready · ${model.parts.length} parts · select a mode; camera is optional`
