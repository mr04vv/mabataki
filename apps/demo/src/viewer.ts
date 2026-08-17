import { Application, Assets, Container, Texture } from 'pixi.js'
import { ExponentialSmoother, loadModel, MabatakiRuntime, validateModel } from '@mabataki/core'
import type { MabatakiModel } from '@mabataki/core'
import { MediaPipeFaceTracker } from '@mabataki/mediapipe'
import { PixiAvatarRenderer } from '@mabataki/pixi'

const DEFAULT_MODEL_URL = '/models/character/model.json'
const MARGIN = 80
const ANIMATION_SPEED = 0.004
const SMOOTHING_TIME_MS = 80

function $<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (element === null) throw new Error(`missing element: ${selector}`)
  return element
}

const stageHost = $('#stage')
const statusEl = $('#status')
const paramNameEl = $('#param-name')
const sliderEl = $<HTMLInputElement>('#slider')
const sliderValueEl = $('#slider-value')
const animateEl = $<HTMLInputElement>('#animate')
const cameraEl = $<HTMLButtonElement>('#camera')
const followCameraEl = $<HTMLInputElement>('#follow-camera')
const cameraVideoEl = $<HTMLVideoElement>('#camera-video')
const trackingValuesEl = $('#tracking-values')
const modelInputEl = $<HTMLInputElement>('#model-input')
const textureInputEl = $<HTMLInputElement>('#texture-input')

const app = new Application()
await app.init({ background: '#14161a', antialias: true })
stageHost.append(app.canvas)
const world = new Container()
world.position.set(MARGIN, MARGIN)
app.stage.addChild(world)

let runtime: MabatakiRuntime
let runtimeReady = false
let avatarRenderer: PixiAvatarRenderer | null = null
let faceTracker: MediaPipeFaceTracker | null = null
let lastVideoTime = -1
let lastTrackingMs = 0
let elapsedMs = 0
let smoothers = new Map<string, ExponentialSmoother>()
const viewScaleSmoother = new ExponentialSmoother(SMOOTHING_TIME_MS)

function layoutWorld(width: number, height: number): void {
  world.pivot.set(width / 2, height / 2)
  world.position.set(MARGIN + width / 2, MARGIN + height / 2)
}

function resetViewScale(): void {
  viewScaleSmoother.reset()
  world.scale.set(1)
}

function applyViewScale(scale: number): void {
  world.scale.set(followCameraEl.checked ? scale : 1)
}

function activeParameter() {
  return runtime.model.parameters[0]
}

function syncParameterControl(): void {
  const parameter = activeParameter()
  sliderEl.disabled = parameter === undefined
  animateEl.disabled = parameter === undefined
  if (parameter === undefined) {
    paramNameEl.textContent = 'no parameters'
    sliderValueEl.textContent = '—'
    return
  }
  const value = runtime.getParameter(parameter.id)
  paramNameEl.textContent = parameter.id
  sliderEl.min = String(parameter.min)
  sliderEl.max = String(parameter.max)
  sliderEl.value = String(value)
  sliderValueEl.textContent = value.toFixed(2)
}

function renderVertices(): void {
  avatarRenderer?.render()
}

async function showModel(model: MabatakiModel, textures: Texture[]): Promise<void> {
  avatarRenderer?.destroy()
  world.removeChildren()
  runtime = new MabatakiRuntime(model)
  runtimeReady = true
  avatarRenderer = new PixiAvatarRenderer(runtime, textures)
  world.addChild(avatarRenderer.container)
  const width = Math.max(1, ...textures.map((texture) => texture.width))
  const height = Math.max(1, ...textures.map((texture) => texture.height))
  layoutWorld(width, height)
  resetViewScale()
  app.renderer.resize(width + MARGIN * 2, height + MARGIN * 2)
  smoothers = new Map(model.parameters.map((parameter) => [
    parameter.id,
    new ExponentialSmoother(SMOOTHING_TIME_MS),
  ]))
  syncParameterControl()
  renderVertices()
  statusEl.textContent = `loaded ${model.parts.length} part(s) and ${model.parameters.length} parameter(s)`
}

async function loadBundledModel(): Promise<void> {
  const model = await loadModel(DEFAULT_MODEL_URL)
  const baseUrl = new URL(DEFAULT_MODEL_URL, location.href)
  const textures = await Promise.all(model.parts.map((part) =>
    Assets.load<Texture>(new URL(part.texture, baseUrl).href),
  ))
  await showModel(model, textures)
}

sliderEl.addEventListener('input', () => {
  const parameter = activeParameter()
  if (parameter === undefined) return
  runtime.update({ [parameter.id]: sliderEl.valueAsNumber })
  sliderValueEl.textContent = runtime.getParameter(parameter.id).toFixed(2)
  renderVertices()
})

followCameraEl.addEventListener('change', () => {
  if (!followCameraEl.checked) world.scale.set(1)
})

cameraEl.addEventListener('click', async () => {
  if (faceTracker !== null) {
    faceTracker.close()
    faceTracker = null
    cameraEl.textContent = 'start camera'
    cameraVideoEl.hidden = true
    trackingValuesEl.textContent = 'camera off'
    lastTrackingMs = 0
    resetViewScale()
    return
  }
  cameraEl.disabled = true
  cameraEl.textContent = 'loading…'
  try {
    lastTrackingMs = 0
    resetViewScale()
    faceTracker = await MediaPipeFaceTracker.create(cameraVideoEl)
    animateEl.checked = false
    cameraVideoEl.hidden = false
    cameraEl.textContent = 'stop camera'
    trackingValuesEl.textContent = 'looking for a face…'
  } catch (error) {
    cameraEl.textContent = 'start camera'
    alert(`Camera tracking failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    cameraEl.disabled = false
  }
})

$('#load-files').addEventListener('click', async () => {
  const modelFile = modelInputEl.files?.[0]
  if (modelFile === undefined) {
    alert('Choose a model.json file first.')
    return
  }
  try {
    const model = validateModel(JSON.parse(await modelFile.text()))
    const files = new Map([...textureInputEl.files ?? []].map((file) => [file.name, file]))
    const textures = await Promise.all(model.parts.map(async (part) => {
      const file = files.get(part.texture)
      if (file === undefined) throw new Error(`missing texture file "${part.texture}"`)
      const url = URL.createObjectURL(file)
      try {
        const image = new Image()
        image.src = url
        await image.decode()
        return Texture.from(image)
      } finally {
        URL.revokeObjectURL(url)
      }
    }))
    await showModel(model, textures)
  } catch (error) {
    alert(`Model load failed: ${error instanceof Error ? error.message : String(error)}`)
  }
})

app.ticker.add((ticker) => {
  if (!runtimeReady) return
  if (faceTracker !== null && cameraVideoEl.currentTime !== lastVideoTime) {
    lastVideoTime = cameraVideoEl.currentTime
    const now = performance.now()
    const frame = faceTracker.sample(now)
    if (frame !== null) {
      const values = frame.parameters
      const deltaMs = lastTrackingMs === 0 ? 0 : now - lastTrackingMs
      lastTrackingMs = now
      const smoothed = Object.fromEntries(Object.entries(values).map(([id, value]) => [
        id,
        smoothers.get(id)?.next(value, deltaMs) ?? value,
      ]))
      runtime.update(smoothed)
      const viewScale = viewScaleSmoother.next(frame.viewTransform.scale, deltaMs)
      applyViewScale(viewScale)
      trackingValuesEl.textContent =
        `yaw ${(smoothed.headYaw ?? values.headYaw).toFixed(2)} · ` +
        `roll ${(smoothed.headRoll ?? values.headRoll).toFixed(2)} · ` +
        `eyes ${(smoothed.eyeOpenLeft ?? values.eyeOpenLeft).toFixed(2)}/` +
        `${(smoothed.eyeOpenRight ?? values.eyeOpenRight).toFixed(2)} · ` +
        `open ${(smoothed.mouthOpen ?? values.mouthOpen).toFixed(2)} · ` +
        `smile L ${values.mouthSmileLeft.toFixed(2)} · ` +
        `R ${values.mouthSmileRight.toFixed(2)} · ` +
        `scale ${viewScale.toFixed(2)} ${followCameraEl.checked ? 'on' : 'off'}`
      syncParameterControl()
    }
  } else if (animateEl.checked) {
    const parameter = activeParameter()
    if (parameter !== undefined) {
      elapsedMs += ticker.deltaMS
      const t = 0.5 - 0.5 * Math.cos(elapsedMs * ANIMATION_SPEED)
      runtime.update({ [parameter.id]: parameter.min + (parameter.max - parameter.min) * t })
      syncParameterControl()
    }
  }
  runtime.step(ticker.deltaMS)
  renderVertices()
})

try {
  await loadBundledModel()
} catch (error) {
  statusEl.textContent = `load failed: ${error instanceof Error ? error.message : String(error)}`
  throw error
}
