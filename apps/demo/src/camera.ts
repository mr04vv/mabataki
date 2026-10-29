import {
  Application,
  Assets,
  Container,
  Graphics,
  Mesh,
  MeshGeometry,
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
import {
  createAccessoryMeshGrid,
  projectEyeAccessoryMesh,
} from './camera-placement'
import { projectAvatarSurfacePositions } from './avatar-surface'
import type { AvatarSurfacePose } from './avatar-surface'

const MODEL_URL = '/models/character/model.json'
const GLASSES_URL = '/models/character/glasses.svg'
const DEFAULT_WIDTH = 640
const DEFAULT_HEIGHT = 480
const AVATAR_SURFACE_REGION = {
  left: 57,
  top: 30,
  right: 512,
  bottom: 470,
  pivotX: 284.5,
  pivotY: 253.3,
  depth: 118,
}
const ACCESSORY_PIVOT_X = 259
const ACCESSORY_PIVOT_Y = 80
const ACCESSORY_EYE_SPAN = 104
const ACCESSORY_CROP = { left: 188, top: 52, right: 330, bottom: 108 }
const SMOOTHING_TIME_MS = 70
const PLACEMENT_SMOOTHING_TIME_MS = 24
const DEFAULT_ACCESSORY_ANCHOR = { x: 0.5, y: 0.42, eyeSpan: 0.22, rotation: 0 }
const DEFAULT_ACCESSORY_POSE = { yaw: 0, pitch: 0 }
const DEFAULT_AVATAR_POSE: AvatarSurfacePose = { yaw: 0, pitch: 0, roll: 0 }

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
const hintEl = $('#hint')
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
const placementXRowEl = $('[data-placement-x]')
const placementYRowEl = $('[data-placement-y]')
const placementScaleRowEl = $('[data-placement-scale]')
const placementXLabelEl = $('#placement-x-label')
const placementYLabelEl = $('#placement-y-label')
const sceneTitleEl = $('#scene-title')
const trackingStateEl = $('#tracking-state')
const trackingDetailsEl = $('#tracking-details')
const modeDescriptionEl = $('#mode-description')
const placementHeadingEl = $('#placement-heading')
const anchorNameEl = $('#anchor-name')
const anchorDetailEl = $('#anchor-detail')
const placementBadgeEl = $('#placement-badge')
const faceCalibrationEl = $<HTMLButtonElement>('#face-calibration')

const app = new Application()
await app.init({
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT,
  background: '#10131d',
  antialias: true,
})
stageHost.append(app.canvas)

const backdrop = new Graphics()
const faceGuide = new Graphics()
const avatar = new Container()
app.stage.addChild(backdrop)
app.stage.addChild(faceGuide)

let videoSprite: Sprite | null = null
let backgroundSprite: Sprite | null = null
app.stage.addChild(avatar)

const accessoryTexture = await Assets.load<Texture>(GLASSES_URL)
const accessoryGrid = createAccessoryMeshGrid({
  columns: 7,
  rows: 3,
  ...ACCESSORY_CROP,
  pivotX: ACCESSORY_PIVOT_X,
  pivotY: ACCESSORY_PIVOT_Y,
  textureWidth: accessoryTexture.width,
  textureHeight: accessoryTexture.height,
})
const accessoryGeometry = new MeshGeometry({
  positions: accessoryGrid.localPoints.slice(),
  uvs: accessoryGrid.uvs,
  indices: accessoryGrid.indices,
})
const accessory = new Mesh({ geometry: accessoryGeometry, texture: accessoryTexture })
accessory.visible = false
app.stage.addChild(accessory)

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
const facePartIndex = model.parts.findIndex((part) => part.id === 'face')
if (facePartIndex < 0) throw new Error('camera avatar projection requires a "face" model part')
const avatarFacePart = model.parts[facePartIndex]
const avatarFaceTexture = modelTextures[facePartIndex]
const avatarFaceGeometry = new MeshGeometry({
  positions: runtime.getPartVertices(avatarFacePart.id).slice(),
  uvs: Float32Array.from(avatarFacePart.mesh.uvs),
  indices: Uint32Array.from(avatarFacePart.mesh.indices),
})
const avatarFaceSurface = new Mesh({
  geometry: avatarFaceGeometry,
  texture: avatarFaceTexture,
})
avatarFaceSurface.visible = false
app.stage.addChild(avatarFaceSurface)
const faceMeshOverlay = new Graphics()
faceMeshOverlay.visible = false
app.stage.addChild(faceMeshOverlay)

let faceTracker: MediaPipeFaceTracker | null = null
let lastVideoTime = -1
let lastFrameMs = 0
let hasTrackedFace = false
let sceneWidth = DEFAULT_WIDTH
let sceneHeight = DEFAULT_HEIGHT
let currentAccessoryAnchor = { ...DEFAULT_ACCESSORY_ANCHOR }
let currentAccessoryPose = { ...DEFAULT_ACCESSORY_POSE }
let neutralAvatarPose: AvatarSurfacePose | null = null
const placementByMode: Record<CompositorMode, PlacementAdjustment> = {
  accessory: defaultPlacementAdjustment(),
  'avatar-overlay': defaultPlacementAdjustment(),
  'avatar-background': defaultPlacementAdjustment(),
}
const parameterSmoothers = new Map(model.parameters.map((parameter) => [
  parameter.id,
  new ExponentialSmoother(
    parameter.id === 'headYaw' || parameter.id === 'headRoll'
      ? PLACEMENT_SMOOTHING_TIME_MS
      : SMOOTHING_TIME_MS,
  ),
]))
const accessorySmoothers = {
  x: new ExponentialSmoother(PLACEMENT_SMOOTHING_TIME_MS),
  y: new ExponentialSmoother(PLACEMENT_SMOOTHING_TIME_MS),
  eyeSpan: new ExponentialSmoother(PLACEMENT_SMOOTHING_TIME_MS),
  rotation: new ExponentialSmoother(PLACEMENT_SMOOTHING_TIME_MS),
  yaw: new ExponentialSmoother(PLACEMENT_SMOOTHING_TIME_MS),
  pitch: new ExponentialSmoother(PLACEMENT_SMOOTHING_TIME_MS),
}

function activeMode(): CompositorMode {
  return modeEl.value as CompositorMode
}

function syncPlacementControls(): void {
  const mode = activeMode()
  const placement = placementByMode[activeMode()]
  placementXEl.value = String(placement.offsetX)
  placementYEl.value = String(placement.offsetY)
  placementScaleEl.value = String(placement.scale)
  placementXRowEl.hidden = mode !== 'avatar-background'
  placementYRowEl.hidden = mode === 'avatar-overlay'
  placementScaleRowEl.hidden = mode === 'avatar-overlay'
  placementResetEl.hidden = mode === 'avatar-overlay'
  placementXEl.disabled = mode !== 'avatar-background'
  placementYEl.disabled = mode === 'avatar-overlay'
  placementScaleEl.disabled = mode === 'avatar-overlay'
  const faceLocal = mode === 'accessory'
  placementXLabelEl.textContent = 'Horizontal offset'
  placementYLabelEl.textContent = faceLocal ? 'Vertical face offset' : 'Vertical offset'
  placementXValueEl.value = `${placement.offsetX}%`
  placementYValueEl.value = faceLocal
    ? `${(placement.offsetY / 100).toFixed(2)} face`
    : `${placement.offsetY}%`
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

function drawFaceGuide(): void {
  faceGuide.clear()
  const centerX = DEFAULT_ACCESSORY_ANCHOR.x * sceneWidth
  const eyeY = DEFAULT_ACCESSORY_ANCHOR.y * sceneHeight
  const eyeSpan = DEFAULT_ACCESSORY_ANCHOR.eyeSpan * sceneWidth
  const headWidth = Math.min(sceneWidth * 0.44, sceneHeight * 0.62)
  const headHeight = Math.min(sceneHeight * 0.7, sceneWidth * 0.52)
  const centerY = eyeY + headHeight * 0.08

  faceGuide.ellipse(centerX, centerY, headWidth / 2, headHeight / 2)
  faceGuide.fill({ color: '#1d2634', alpha: 0.94 })
  faceGuide.ellipse(centerX, centerY, headWidth / 2, headHeight / 2)
  faceGuide.stroke({ color: '#39475b', alpha: 0.9, width: 2 })
  faceGuide.circle(centerX - eyeSpan / 2, eyeY, 5)
  faceGuide.circle(centerX + eyeSpan / 2, eyeY, 5)
  faceGuide.fill({ color: '#6e8cff', alpha: 0.9 })
  faceGuide
    .moveTo(centerX - eyeSpan / 2, eyeY)
    .lineTo(centerX + eyeSpan / 2, eyeY)
  faceGuide.stroke({ color: '#6e8cff', alpha: 0.38, width: 1 })
  faceGuide
    .moveTo(centerX, eyeY + 12)
    .lineTo(centerX - 4, eyeY + 48)
    .lineTo(centerX + 5, eyeY + 48)
  faceGuide.stroke({ color: '#657287', alpha: 0.7, width: 2 })
  faceGuide.arc(centerX, eyeY + 68, 28, 0.18, Math.PI - 0.18)
  faceGuide.stroke({ color: '#657287', alpha: 0.7, width: 2 })
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
  drawFaceGuide()
  layoutVideoSprite()
  layoutBackgroundSprite()
  layoutTrackedObjects()
}

function layoutTrackedObjects(): void {
  const mode = activeMode()
  const placement = placementByMode[mode]
  const screenOffsetX = placement.offsetX / 100 * sceneWidth
  const screenOffsetY = placement.offsetY / 100 * sceneHeight

  if (mode === 'accessory') {
    const positions = projectEyeAccessoryMesh(
      currentAccessoryAnchor,
      placement,
      currentAccessoryPose,
      sceneWidth,
      sceneHeight,
      ACCESSORY_EYE_SPAN,
      accessoryGrid.localPoints,
    )
    const buffer = accessoryGeometry.getBuffer('aPosition')
    ;(buffer.data as Float32Array).set(positions)
    buffer.update()
  } else if (mode === 'avatar-background') {
    avatar.pivot.set(modelWidth / 2, modelHeight / 2)
    avatar.position.set(sceneWidth * 0.76 + screenOffsetX, sceneHeight * 0.53 + screenOffsetY)
    avatar.rotation = 0
    const scale = Math.min(sceneWidth / modelWidth, sceneHeight / modelHeight) *
      0.76 * placement.scale
    avatar.scale.set(scale)
  }
}

function syncMode(): void {
  const mode = activeMode()
  const accessoryPreview = mode === 'accessory' && faceTracker === null
  backdrop.visible = accessoryPreview || (mode === 'avatar-background' && backgroundSprite === null)
  faceGuide.visible = accessoryPreview
  if (backgroundSprite !== null) {
    backgroundSprite.visible = mode === 'avatar-background'
  }
  if (videoSprite !== null) {
    videoSprite.visible = faceTracker !== null && mode !== 'avatar-background'
  }
  avatar.visible = mode === 'avatar-background'
  avatarFaceSurface.visible = mode === 'avatar-overlay' &&
    hasTrackedFace &&
    neutralAvatarPose !== null
  accessory.visible = mode === 'accessory' && (hasTrackedFace || accessoryPreview)
  faceMeshOverlay.visible = showFaceMeshEl.checked && faceTracker !== null
  backgroundInputEl.disabled = mode !== 'avatar-background'
  faceCalibrationEl.hidden = mode !== 'avatar-overlay'
  faceCalibrationEl.disabled = !hasTrackedFace
  document.body.dataset.camera = hasTrackedFace
    ? 'tracking'
    : faceTracker === null
      ? 'preview'
      : 'searching'
  if (mode === 'accessory') {
    sceneTitleEl.textContent = 'Accessory preview'
    placementHeadingEl.textContent = 'Attachment'
    anchorNameEl.textContent = 'Eye line'
    anchorDetailEl.textContent = 'Horizontal position · Automatic'
    placementBadgeEl.textContent = 'Auto'
    hintEl.textContent = 'Eye landmarks place the mesh; 3D face pose adds perspective during head turns.'
    modeDescriptionEl.textContent =
      'Eye landmarks place the glasses while 3D face pose warps their mesh through head turns.'
    if (!hasTrackedFace) {
      trackingDetailsEl.textContent = 'Demo face · eye anchor 0.50 / 0.42 · span 0.22'
    }
  } else if (mode === 'avatar-overlay') {
    sceneTitleEl.textContent = '2.5D tracked avatar'
    placementHeadingEl.textContent = 'Avatar projection'
    anchorNameEl.textContent = 'Authored mesh'
    anchorDetailEl.textContent = 'MediaPipe rigid pose · Runtime expressions'
    placementBadgeEl.textContent = '2.5D'
    hintEl.textContent = 'The authored avatar turns with MediaPipe without adopting the user’s face shape.'
    modeDescriptionEl.textContent =
      'MediaPipe supplies 3D head pose while the Runtime preserves authored mouth and eye poses.'
    if (!hasTrackedFace) trackingDetailsEl.textContent = 'Look forward when the camera first detects your face.'
  } else {
    sceneTitleEl.textContent = 'Background + avatar'
    placementHeadingEl.textContent = 'Scene placement'
    anchorNameEl.textContent = 'Canvas'
    anchorDetailEl.textContent = 'Manual scene composition'
    placementBadgeEl.textContent = 'Manual'
    hintEl.textContent = 'Choose any background image and place the avatar in the scene.'
    modeDescriptionEl.textContent =
      'Compose the avatar over any background. Camera tracking remains optional.'
    if (!hasTrackedFace) trackingDetailsEl.textContent = 'Camera tracking is optional in this mode.'
  }
  trackingStateEl.textContent = hasTrackedFace
    ? 'Tracking'
    : faceTracker === null
      ? 'Preview'
      : 'Finding face'
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

function updateAvatarFaceSurface(frame: FaceTrackingFrame): void {
  if (frame.viewTransform.faceWidth <= 0) return
  const pose = {
    yaw: currentAccessoryPose.yaw,
    pitch: currentAccessoryPose.pitch,
    roll: currentAccessoryAnchor.rotation,
  }
  neutralAvatarPose ??= { ...pose }
  const positions = projectAvatarSurfacePositions(
    runtime.getPartVertices(avatarFacePart.id),
    AVATAR_SURFACE_REGION,
    frame.viewTransform,
    pose,
    neutralAvatarPose,
    sceneWidth,
    sceneHeight,
  )
  const positionBuffer = avatarFaceGeometry.getBuffer('aPosition')
  ;(positionBuffer.data as Float32Array).set(positions)
  positionBuffer.update()
  avatarFaceSurface.visible = activeMode() === 'avatar-overlay'
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
  runtime.update(activeMode() === 'avatar-overlay'
    ? { ...smoothed, headYaw: 0, headRoll: 0 }
    : smoothed)
  const accessoryAnchor = estimateEyeAccessoryAnchor(frame.landmarks)
  if (accessoryAnchor !== null) {
    currentAccessoryAnchor = {
      x: accessorySmoothers.x.next(accessoryAnchor.x, deltaMs),
      y: accessorySmoothers.y.next(accessoryAnchor.y, deltaMs),
      eyeSpan: accessorySmoothers.eyeSpan.next(accessoryAnchor.eyeSpan, deltaMs),
      rotation: accessorySmoothers.rotation.next(accessoryAnchor.rotation, deltaMs),
    }
  }
  const targetYaw = frame.facePose?.yaw ?? frame.parameters.headYaw * Math.PI * 35 / 180
  const targetPitch = frame.facePose?.pitch ?? 0
  currentAccessoryPose = {
    yaw: accessorySmoothers.yaw.next(targetYaw, deltaMs),
    pitch: accessorySmoothers.pitch.next(targetPitch, deltaMs),
  }
  updateAvatarFaceSurface(frame)
  trackingDetailsEl.textContent = activeMode() === 'avatar-overlay'
    ? `Authored surface ${avatarFacePart.mesh.vertices.length / 2} vertices · ` +
      `yaw ${(currentAccessoryPose.yaw * 180 / Math.PI).toFixed(1)}° · ` +
      (neutralAvatarPose !== null ? 'pose calibrated' : 'look forward to calibrate')
    : `Eye anchor ${currentAccessoryAnchor.x.toFixed(2)} / ` +
      `${currentAccessoryAnchor.y.toFixed(2)} · span ${currentAccessoryAnchor.eyeSpan.toFixed(2)} · ` +
      `roll ${(currentAccessoryAnchor.rotation * 180 / Math.PI).toFixed(1)}° · ` +
      `yaw ${(currentAccessoryPose.yaw * 180 / Math.PI).toFixed(1)}°`
  drawFaceMesh(frame.landmarks)
  layoutTrackedObjects()
  statusEl.textContent =
    `tracking · yaw ${(currentAccessoryPose.yaw * 180 / Math.PI).toFixed(1)}° ` +
    `→ ${frame.parameters.headYaw.toFixed(2)} · ` +
    `roll ${frame.parameters.headRoll.toFixed(2)} · mouth ${frame.parameters.mouthOpen.toFixed(2)}` +
    (showFaceMeshEl.checked ? ` · mesh ${frame.landmarks.length}` : '')
}

async function stopCamera(): Promise<void> {
  faceTracker?.close()
  faceTracker = null
  lastVideoTime = -1
  lastFrameMs = 0
  hasTrackedFace = false
  currentAccessoryAnchor = { ...DEFAULT_ACCESSORY_ANCHOR }
  currentAccessoryPose = { ...DEFAULT_ACCESSORY_POSE }
  neutralAvatarPose = null
  avatarFaceSurface.visible = false
  faceMeshOverlay.clear()
  for (const smoother of parameterSmoothers.values()) smoother.reset()
  for (const smoother of Object.values(accessorySmoothers)) smoother.reset()
  if (videoSprite !== null) {
    app.stage.removeChild(videoSprite)
    videoSprite.destroy()
    videoSprite = null
  }
  cameraEl.textContent = 'Start camera'
  trackingDetailsEl.textContent = 'Demo face · eye anchor 0.50 / 0.42 · span 0.22'
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
  cameraEl.textContent = 'Loading…'
  statusEl.textContent = 'requesting camera access…'
  try {
    faceTracker = await MediaPipeFaceTracker.create(videoEl)
    const width = videoEl.videoWidth || DEFAULT_WIDTH
    const height = videoEl.videoHeight || DEFAULT_HEIGHT
    videoSprite = new Sprite(Texture.from(videoEl))
    app.stage.addChildAt(videoSprite, 1)
    resizeScene(width, height)
    cameraEl.textContent = 'Stop camera'
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
  if (faceTracker === null) {
    statusEl.textContent = activeMode() === 'accessory'
      ? 'accessory preview ready · horizontal placement is automatic'
      : activeMode() === 'avatar-overlay'
        ? 'camera + avatar ready · start the camera to track a face'
        : 'background + avatar ready · camera is optional for tracking'
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
faceCalibrationEl.addEventListener('click', () => {
  neutralAvatarPose = null
  avatarFaceSurface.visible = false
  statusEl.textContent = 'look straight ahead · recalibrating the neutral head pose…'
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
drawFaceGuide()
syncPlacementControls()
layoutTrackedObjects()
syncMode()
renderVertices()
statusEl.textContent = `preview ready · ${model.parts.length} parts · start the camera when ready`
