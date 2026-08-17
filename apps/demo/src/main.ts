import { Application, Assets, Container, Graphics, Mesh, MeshGeometry, Texture } from 'pixi.js'
import type { FederatedPointerEvent } from 'pixi.js'
import {
  applyDeformations,
  createGridMesh,
  createGridMeshRegion,
  loadModel,
  MabatakiRuntime,
  ParameterStore,
  validateModel,
} from '@mabataki/core'
import type { Binding, Keyframe, MabatakiModel, ParameterDef, Part } from '@mabataki/core'
import { MediaPipeFaceTracker } from '@mabataki/mediapipe'
import { softSelectionWeights, verticesInRect } from './editor-tools'

const DEFAULT_MODEL_URL = '/models/character/model.json'
const MARGIN = 80
const PICK_RADIUS = 14
const HANDLE_RADIUS = 5
const ANIMATION_SPEED = 0.004
const TRACKING_SMOOTHING = 0.5
const VIEW_SCALE_SMOOTHING = 0.25

function $<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (element === null) throw new Error(`missing element: ${selector}`)
  return element
}

interface RenderedPart {
  base: Float32Array
  positions: Float32Array
  geometry: MeshGeometry
  mesh: Mesh
}

interface HistoryEntry {
  partId: string
  parameterId: string
  keyValue: number
  before: number[]
  after: number[]
}

type PointerDrag =
  | {
      kind: 'move'
      startX: number
      startY: number
      before: number[]
      weights: Float32Array
    }
  | {
      kind: 'box' | 'region'
      startX: number
      startY: number
      currentX: number
      currentY: number
      additive: boolean
      subtractive: boolean
    }

const stageHost = $('#stage')
const statusEl = $('#status')
const partEl = $<HTMLSelectElement>('#part')
const parameterEl = $<HTMLSelectElement>('#parameter')
const keyPoseEl = $<HTMLSelectElement>('#key-pose')
const paramNameEl = $('#param-name')
const sliderEl = $<HTMLInputElement>('#slider')
const sliderValueEl = $('#slider-value')
const animateEl = $<HTMLInputElement>('#animate')
const colsEl = $<HTMLInputElement>('#cols')
const rowsEl = $<HTMLInputElement>('#rows')
const imageInput = $<HTMLInputElement>('#image-input')
const modelInput = $<HTMLInputElement>('#model-input')
const modeRadios = [...document.querySelectorAll<HTMLInputElement>('input[name="mode"]')]
const cameraEl = $<HTMLButtonElement>('#camera')
const followCameraEl = $<HTMLInputElement>('#follow-camera')
const cameraVideoEl = $<HTMLVideoElement>('#camera-video')
const trackingValuesEl = $('#tracking-values')
const toolEl = $<HTMLSelectElement>('#tool')
const softSelectionEl = $<HTMLInputElement>('#soft-selection')
const softRadiusEl = $<HTMLInputElement>('#soft-radius')
const selectionCountEl = $('#selection-count')
const pinCountEl = $('#pin-count')
const regionStatusEl = $('#region-status')
const rebuildRegionEl = $<HTMLButtonElement>('#rebuild-region')
const undoEl = $<HTMLButtonElement>('#undo')
const redoEl = $<HTMLButtonElement>('#redo')

let model: MabatakiModel
let store: ParameterStore
let previewRuntime: MabatakiRuntime
let mode: 'edit' | 'preview' = 'edit'
let pointerDrag: PointerDrag | null = null
let elapsedMs = 0
let faceTracker: MediaPipeFaceTracker | null = null
let lastVideoTime = -1
let smoothedViewScale = 1
let smoothedTracking = {
  headYaw: 0,
  headRoll: 0,
  eyeOpenLeft: 1,
  eyeOpenRight: 1,
  mouthOpen: 0,
  mouthSmileLeft: 0,
  mouthSmileRight: 0,
}
const textures = new Map<string, Texture>()
const renderedParts = new Map<string, RenderedPart>()
const selectedVertices = new Set<number>()
const pinnedByPart = new Map<string, Set<number>>()
const meshRegions = new Map<string, { x1: number; y1: number; x2: number; y2: number }>()
const undoStack: HistoryEntry[] = []
const redoStack: HistoryEntry[] = []

const app = new Application()
await app.init({ background: '#14161a', antialias: true })
stageHost.append(app.canvas)
const world = new Container()
world.position.set(MARGIN, MARGIN)
app.stage.addChild(world)
const overlay = new Graphics()

function layoutWorld(width: number, height: number): void {
  world.pivot.set(width / 2, height / 2)
  world.position.set(MARGIN + width / 2, MARGIN + height / 2)
}

function resetViewScale(): void {
  smoothedViewScale = 1
  world.scale.set(1)
}

function applyViewScale(): void {
  world.scale.set(followCameraEl.checked ? smoothedViewScale : 1)
}

// --- model selection -----------------------------------------------------

function activePart(): Part {
  const part = model.parts.find((candidate) => candidate.id === partEl.value)
  if (part === undefined) throw new Error(`unknown part "${partEl.value}"`)
  return part
}

function activeBinding(): Binding {
  const binding = activePart().bindings[Number(parameterEl.value)]
  if (binding === undefined) throw new Error('selected part has no binding')
  return binding
}

function boundParam(): ParameterDef {
  const id = activeBinding().parameterId
  const parameter = model.parameters.find((candidate) => candidate.id === id)
  if (parameter === undefined) throw new Error(`parameter "${id}" is not declared`)
  return parameter
}

function activeKeyframe(): Keyframe {
  const keyframe = activeBinding().keyframes[Number(keyPoseEl.value)]
  if (keyframe === undefined) throw new Error('selected binding has no key pose')
  return keyframe
}

function replaceOptions(
  select: HTMLSelectElement,
  options: { value: string; label: string }[],
  preferred?: string,
): void {
  select.replaceChildren(...options.map(({ value, label }) => {
    const option = document.createElement('option')
    option.value = value
    option.textContent = label
    return option
  }))
  if (preferred !== undefined && options.some((option) => option.value === preferred)) {
    select.value = preferred
  }
}

function populateKeyPoses(preferred?: string): void {
  const zeroIndex = activeBinding().keyframes.findIndex((keyframe) => keyframe.value === 0)
  replaceOptions(
    keyPoseEl,
    activeBinding().keyframes.map((keyframe, index) => ({
      value: String(index),
      label: String(keyframe.value),
    })),
    preferred ?? String(Math.max(0, zeroIndex)),
  )
  if (mode === 'edit') store.set(boundParam().id, activeKeyframe().value)
}

function populateParameters(preferred?: string, preferredKeyPose?: string): void {
  replaceOptions(
    parameterEl,
    activePart().bindings.map((binding, index) => ({
      value: String(index),
      label: binding.parameterId,
    })),
    preferred,
  )
  populateKeyPoses(preferredKeyPose)
}

function populateParts(preferred?: string): void {
  replaceOptions(
    partEl,
    model.parts.map((part) => ({ value: part.id, label: part.id })),
    preferred,
  )
  populateParameters()
}

function syncParameterControl(): void {
  const parameter = boundParam()
  const value = store.get(parameter.id)
  paramNameEl.textContent = parameter.id
  sliderEl.min = String(parameter.min)
  sliderEl.max = String(parameter.max)
  sliderEl.value = String(value)
  sliderValueEl.textContent = value.toFixed(2)
}

function clearSelection(): void {
  selectedVertices.clear()
  pointerDrag = null
  syncSelectionUi()
}

function pinnedVertices(): Set<number> {
  let pinned = pinnedByPart.get(activePart().id)
  if (pinned === undefined) {
    pinned = new Set<number>()
    pinnedByPart.set(activePart().id, pinned)
  }
  return pinned
}

function currentMeshRegion() {
  return meshRegions.get(activePart().id)
}

function inferMeshRegions(): void {
  meshRegions.clear()
  for (const part of model.parts) {
    const texture = textures.get(part.id)
    if (texture === undefined) continue
    const xs = part.mesh.vertices.filter((_, index) => index % 2 === 0)
    const ys = part.mesh.vertices.filter((_, index) => index % 2 === 1)
    const region = {
      x1: Math.min(...xs),
      y1: Math.min(...ys),
      x2: Math.max(...xs),
      y2: Math.max(...ys),
    }
    if (region.x1 > 0 || region.y1 > 0 || region.x2 < texture.width || region.y2 < texture.height) {
      meshRegions.set(part.id, region)
    }
  }
}

function syncSelectionUi(): void {
  selectionCountEl.textContent = `${selectedVertices.size} selected`
  pinCountEl.textContent = `${pinnedVertices().size} pinned`
  softRadiusEl.disabled = !softSelectionEl.checked
  const region = currentMeshRegion()
  rebuildRegionEl.disabled = region === undefined
  regionStatusEl.textContent = region === undefined
    ? 'no region'
    : `${Math.round(region.x1)},${Math.round(region.y1)} → ${Math.round(region.x2)},${Math.round(region.y2)}`
}

function syncHistoryUi(): void {
  undoEl.disabled = undoStack.length === 0
  redoEl.disabled = redoStack.length === 0
}

function clearHistory(): void {
  undoStack.length = 0
  redoStack.length = 0
  syncHistoryUi()
}

function makeHistoryEntry(before: number[], after: number[]): HistoryEntry {
  return {
    partId: activePart().id,
    parameterId: activeBinding().parameterId,
    keyValue: activeKeyframe().value,
    before,
    after,
  }
}

function pushHistory(entry: HistoryEntry): void {
  if (entry.before.every((value, index) => value === entry.after[index])) return
  undoStack.push(entry)
  redoStack.length = 0
  syncHistoryUi()
}

function showHistoryTarget(entry: HistoryEntry): Keyframe | null {
  const part = model.parts.find((candidate) => candidate.id === entry.partId)
  if (part === undefined) return null
  const bindingIndex = part.bindings.findIndex(
    (candidate) => candidate.parameterId === entry.parameterId,
  )
  if (bindingIndex < 0) return null
  const keyIndex = part.bindings[bindingIndex].keyframes.findIndex(
    (candidate) => candidate.value === entry.keyValue,
  )
  if (keyIndex < 0) return null
  partEl.value = part.id
  populateParameters(String(bindingIndex), String(keyIndex))
  setMode('edit')
  clearSelection()
  return part.bindings[bindingIndex].keyframes[keyIndex]
}

function applyHistory(entry: HistoryEntry, values: number[]): void {
  const keyframe = showHistoryTarget(entry)
  if (keyframe === null) return
  keyframe.deltas = [...values]
  refresh()
}

// --- rendering -----------------------------------------------------------

function rebuildScene(): void {
  previewRuntime = new MabatakiRuntime(model)
  previewRuntime.update(store.values())
  for (const rendered of renderedParts.values()) {
    rendered.mesh.destroy()
    rendered.geometry.destroy()
  }
  renderedParts.clear()
  world.removeChildren()
  for (const part of model.parts) {
    const texture = textures.get(part.id)
    if (texture === undefined) throw new Error(`missing texture for part "${part.id}"`)
    const base = Float32Array.from(part.mesh.vertices)
    const positions = Float32Array.from(part.mesh.vertices)
    const geometry = new MeshGeometry({
      positions,
      uvs: Float32Array.from(part.mesh.uvs),
      indices: Uint32Array.from(part.mesh.indices),
    })
    const mesh = new Mesh({ geometry, texture })
    renderedParts.set(part.id, { base, positions, geometry, mesh })
    world.addChild(mesh)
  }
  world.addChild(overlay)
  const widths = [...textures.values()].map((texture) => texture.width)
  const heights = [...textures.values()].map((texture) => texture.height)
  const width = Math.max(...widths)
  const height = Math.max(...heights)
  layoutWorld(width, height)
  app.renderer.resize(width + MARGIN * 2, height + MARGIN * 2)
  app.stage.hitArea = app.screen
  refresh()
}

function computePositions(): void {
  const values = store.values()
  if (mode === 'preview') previewRuntime.update(values)
  for (const part of model.parts) {
    const rendered = renderedParts.get(part.id)
    if (rendered === undefined) continue
    if (mode === 'preview') {
      rendered.positions.set(previewRuntime.getPartVertices(part.id))
    } else if (part.id === activePart().id) {
      const keyframe = activeKeyframe()
      rendered.positions.set(rendered.base)
      for (let i = 0; i < rendered.base.length; i++) {
        rendered.positions[i] += keyframe.deltas[i]
      }
    } else {
      applyDeformations(rendered.base, part.bindings, values, rendered.positions)
    }
  }
}

function pushPositions(): void {
  for (const rendered of renderedParts.values()) {
    const buffer = rendered.geometry.getBuffer('aPosition')
    ;(buffer.data as Float32Array).set(rendered.positions)
    buffer.update()
  }
}

function drawOverlay(): void {
  overlay.clear()
  if (mode !== 'edit') return
  const part = activePart()
  const rendered = renderedParts.get(part.id)
  if (rendered === undefined) return
  const positions = rendered.positions
  for (let triangle = 0; triangle < part.mesh.indices.length; triangle += 3) {
    const a = part.mesh.indices[triangle] * 2
    const b = part.mesh.indices[triangle + 1] * 2
    const c = part.mesh.indices[triangle + 2] * 2
    overlay.moveTo(positions[a], positions[a + 1])
    overlay.lineTo(positions[b], positions[b + 1])
    overlay.lineTo(positions[c], positions[c + 1])
    overlay.lineTo(positions[a], positions[a + 1])
  }
  overlay.stroke({ color: 0x4fa3ff, alpha: 0.35, width: 1 })
  const pinned = pinnedVertices()
  const softWeights = softSelectionWeights(
    positions,
    selectedVertices,
    softRadiusEl.valueAsNumber,
    softSelectionEl.checked,
    pinned,
  )
  for (let vertex = 0; vertex < positions.length; vertex += 2) {
    if (softWeights[vertex / 2] > 0 && !selectedVertices.has(vertex / 2)) {
      overlay.circle(positions[vertex], positions[vertex + 1], HANDLE_RADIUS + 1)
    }
  }
  overlay.fill({ color: 0xa36bff, alpha: 0.75 })
  for (let vertex = 0; vertex < positions.length; vertex += 2) {
    if (!selectedVertices.has(vertex / 2) && !pinned.has(vertex / 2)) {
      overlay.circle(positions[vertex], positions[vertex + 1], HANDLE_RADIUS)
    }
  }
  overlay.fill({ color: 0x4fa3ff, alpha: 0.9 })
  for (const vertex of selectedVertices) {
    if (pinned.has(vertex)) continue
    overlay.circle(positions[vertex * 2], positions[vertex * 2 + 1], HANDLE_RADIUS + 2)
  }
  overlay.fill({ color: 0xffa640, alpha: 1 })
  for (const vertex of pinned) {
    overlay.circle(positions[vertex * 2], positions[vertex * 2 + 1], HANDLE_RADIUS + 1)
  }
  overlay.fill({ color: 0xff5f6d, alpha: 0.95 })
  const meshRegion = currentMeshRegion()
  if (meshRegion !== undefined && pointerDrag?.kind !== 'region') {
    overlay.rect(
      meshRegion.x1,
      meshRegion.y1,
      meshRegion.x2 - meshRegion.x1,
      meshRegion.y2 - meshRegion.y1,
    )
    overlay.stroke({ color: 0x55d68b, alpha: 0.9, width: 2 })
  }
  if (pointerDrag !== null && pointerDrag.kind !== 'move') {
    const color = pointerDrag.kind === 'region' ? 0x55d68b : 0x4fa3ff
    overlay.rect(
      pointerDrag.startX,
      pointerDrag.startY,
      pointerDrag.currentX - pointerDrag.startX,
      pointerDrag.currentY - pointerDrag.startY,
    )
    overlay.fill({ color, alpha: 0.12 })
    overlay.stroke({ color, alpha: 0.9, width: 1 })
  }
}

function updateStatus(): void {
  const part = activePart()
  const parameter = boundParam()
  const vertexCount = part.mesh.vertices.length / 2
  statusEl.textContent = mode === 'edit'
    ? `editing ${part.id}.${parameter.id} @ ${activeKeyframe().value} — ${toolEl.value}, ${selectedVertices.size}/${vertexCount} selected`
    : `previewing ${parameter.id} = ${store.get(parameter.id).toFixed(2)} (${model.parts.length} parts)`
}

function refresh(): void {
  syncParameterControl()
  computePositions()
  pushPositions()
  drawOverlay()
  updateStatus()
}

function adoptModel(next: MabatakiModel): void {
  model = validateModel(next)
  if (model.parts.length === 0) throw new Error('the editor requires at least one part')
  if (model.parts.some((part) => part.bindings.length === 0)) {
    throw new Error('every editable part must have at least one binding')
  }
  store = new ParameterStore(model.parameters)
  pinnedByPart.clear()
  inferMeshRegions()
  populateParts()
  clearSelection()
  clearHistory()
  rebuildScene()
}

// --- interaction --------------------------------------------------------

function setMode(next: 'edit' | 'preview'): void {
  mode = next
  for (const radio of modeRadios) radio.checked = radio.value === next
  if (next === 'edit') store.set(boundParam().id, activeKeyframe().value)
  else {
    previewRuntime = new MabatakiRuntime(model)
    previewRuntime.update(store.values())
  }
  refresh()
}

function pickVertex(x: number, y: number): number | null {
  const rendered = renderedParts.get(activePart().id)
  if (rendered === undefined) return null
  let best: number | null = null
  let bestDistance = PICK_RADIUS
  for (let vertex = 0; vertex < rendered.positions.length / 2; vertex++) {
    const distance = Math.hypot(
      rendered.positions[vertex * 2] - x,
      rendered.positions[vertex * 2 + 1] - y,
    )
    if (distance < bestDistance) {
      bestDistance = distance
      best = vertex
    }
  }
  return best
}

app.stage.eventMode = 'static'
app.stage.on('pointerdown', (event: FederatedPointerEvent) => {
  if (mode !== 'edit') return
  const local = world.toLocal(event.global)
  if (toolEl.value === 'box' || toolEl.value === 'region') {
    pointerDrag = {
      kind: toolEl.value,
      startX: local.x,
      startY: local.y,
      currentX: local.x,
      currentY: local.y,
      additive: event.shiftKey,
      subtractive: event.altKey,
    }
    refresh()
    return
  }
  const picked = pickVertex(local.x, local.y)
  if (picked === null) {
    if (!event.shiftKey) clearSelection()
    refresh()
    return
  }
  if (pinnedVertices().has(picked)) return
  if (!selectedVertices.has(picked)) {
    if (!event.shiftKey) selectedVertices.clear()
    selectedVertices.add(picked)
  }
  syncSelectionUi()
  const rendered = renderedParts.get(activePart().id)
  if (rendered === undefined) return
  pointerDrag = {
    kind: 'move',
    startX: local.x,
    startY: local.y,
    before: [...activeKeyframe().deltas],
    weights: softSelectionWeights(
      rendered.positions,
      selectedVertices,
      softRadiusEl.valueAsNumber,
      softSelectionEl.checked,
      pinnedVertices(),
    ),
  }
  refresh()
})
app.stage.on('pointermove', (event: FederatedPointerEvent) => {
  if (pointerDrag === null || mode !== 'edit') return
  const rendered = renderedParts.get(activePart().id)
  if (rendered === undefined) return
  const local = world.toLocal(event.global)
  if (pointerDrag.kind !== 'move') {
    pointerDrag.currentX = local.x
    pointerDrag.currentY = local.y
    refresh()
    return
  }
  const keyframe = activeKeyframe()
  const deltaX = local.x - pointerDrag.startX
  const deltaY = local.y - pointerDrag.startY
  for (let vertex = 0; vertex < pointerDrag.weights.length; vertex++) {
    const weight = pointerDrag.weights[vertex]
    keyframe.deltas[vertex * 2] = pointerDrag.before[vertex * 2] + deltaX * weight
    keyframe.deltas[vertex * 2 + 1] = pointerDrag.before[vertex * 2 + 1] + deltaY * weight
  }
  refresh()
})
const endDrag = (): void => {
  if (pointerDrag === null) return
  if (pointerDrag.kind === 'move') {
    pushHistory(makeHistoryEntry(pointerDrag.before, [...activeKeyframe().deltas]))
  } else if (pointerDrag.kind === 'box') {
    const rendered = renderedParts.get(activePart().id)
    if (rendered !== undefined) {
      const vertices = verticesInRect(rendered.positions, {
        x1: pointerDrag.startX,
        y1: pointerDrag.startY,
        x2: pointerDrag.currentX,
        y2: pointerDrag.currentY,
      })
      if (!pointerDrag.additive && !pointerDrag.subtractive) selectedVertices.clear()
      for (const vertex of vertices) {
        if (pointerDrag.subtractive) selectedVertices.delete(vertex)
        else if (!pinnedVertices().has(vertex)) selectedVertices.add(vertex)
      }
      syncSelectionUi()
    }
  } else {
    const texture = textures.get(activePart().id)
    if (texture !== undefined) {
      const x1 = Math.max(0, Math.min(texture.width, pointerDrag.startX, pointerDrag.currentX))
      const y1 = Math.max(0, Math.min(texture.height, pointerDrag.startY, pointerDrag.currentY))
      const x2 = Math.max(0, Math.min(texture.width, Math.max(pointerDrag.startX, pointerDrag.currentX)))
      const y2 = Math.max(0, Math.min(texture.height, Math.max(pointerDrag.startY, pointerDrag.currentY)))
      if (x2 - x1 >= 1 && y2 - y1 >= 1) {
        meshRegions.set(activePart().id, { x1, y1, x2, y2 })
        syncSelectionUi()
      }
    }
  }
  pointerDrag = null
  refresh()
}
app.stage.on('pointerup', endDrag)
app.stage.on('pointerupoutside', endDrag)

// --- controls -----------------------------------------------------------

partEl.addEventListener('change', () => {
  populateParameters(parameterEl.value, keyPoseEl.value)
  clearSelection()
  refresh()
})

parameterEl.addEventListener('change', () => {
  populateKeyPoses()
  clearSelection()
  refresh()
})

keyPoseEl.addEventListener('change', () => {
  if (mode === 'edit') store.set(boundParam().id, activeKeyframe().value)
  clearSelection()
  refresh()
})

toolEl.addEventListener('change', () => {
  pointerDrag = null
  refresh()
})

softSelectionEl.addEventListener('change', () => {
  syncSelectionUi()
  refresh()
})

softRadiusEl.addEventListener('input', refresh)

$('#clear-selection').addEventListener('click', () => {
  clearSelection()
  refresh()
})

$('#pin-selection').addEventListener('click', () => {
  const pinned = pinnedVertices()
  for (const vertex of selectedVertices) pinned.add(vertex)
  clearSelection()
  refresh()
})

$('#unpin-all').addEventListener('click', () => {
  pinnedVertices().clear()
  syncSelectionUi()
  refresh()
})

undoEl.addEventListener('click', () => {
  const entry = undoStack.pop()
  if (entry === undefined) return
  applyHistory(entry, entry.before)
  redoStack.push(entry)
  syncHistoryUi()
})

redoEl.addEventListener('click', () => {
  const entry = redoStack.pop()
  if (entry === undefined) return
  applyHistory(entry, entry.after)
  undoStack.push(entry)
  syncHistoryUi()
})

window.addEventListener('keydown', (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
  event.preventDefault()
  if (event.shiftKey) redoEl.click()
  else undoEl.click()
})

for (const radio of modeRadios) {
  radio.addEventListener('change', () => {
    if (radio.checked) setMode(radio.value as 'edit' | 'preview')
  })
}

sliderEl.addEventListener('input', () => {
  const parameter = boundParam()
  store.set(parameter.id, sliderEl.valueAsNumber)
  if (mode !== 'preview') setMode('preview')
  else refresh()
})

animateEl.addEventListener('change', () => {
  if (animateEl.checked && mode !== 'preview') setMode('preview')
})

followCameraEl.addEventListener('change', applyViewScale)

app.ticker.add((ticker) => {
  if (faceTracker !== null && cameraVideoEl.currentTime !== lastVideoTime) {
    lastVideoTime = cameraVideoEl.currentTime
    const frame = faceTracker.sample(performance.now())
    if (frame !== null) {
      const values = frame.parameters
      for (const key of Object.keys(values) as (keyof typeof values)[]) {
        smoothedTracking[key] += (values[key] - smoothedTracking[key]) * TRACKING_SMOOTHING
        if (model.parameters.some((parameter) => parameter.id === key)) {
          store.set(key, smoothedTracking[key])
        }
      }
      smoothedViewScale +=
        (frame.viewTransform.scale - smoothedViewScale) * VIEW_SCALE_SMOOTHING
      applyViewScale()
      trackingValuesEl.textContent =
        `yaw ${smoothedTracking.headYaw.toFixed(2)} · roll ${smoothedTracking.headRoll.toFixed(2)} · ` +
        `eyes ${smoothedTracking.eyeOpenLeft.toFixed(2)}/${smoothedTracking.eyeOpenRight.toFixed(2)} · ` +
        `open ${smoothedTracking.mouthOpen.toFixed(2)} · ` +
        `smile L ${smoothedTracking.mouthSmileLeft.toFixed(2)} · ` +
        `R ${smoothedTracking.mouthSmileRight.toFixed(2)} · ` +
        `scale ${smoothedViewScale.toFixed(2)} ${followCameraEl.checked ? 'on' : 'off'}`
    }
  } else if (animateEl.checked && mode === 'preview') {
    elapsedMs += ticker.deltaMS
    const parameter = boundParam()
    const t = 0.5 - 0.5 * Math.cos(elapsedMs * ANIMATION_SPEED)
    store.set(parameter.id, parameter.min + (parameter.max - parameter.min) * t)
  }
  if (mode === 'preview') {
    previewRuntime.update(store.values())
    previewRuntime.step(ticker.deltaMS)
    refresh()
  }
})

cameraEl.addEventListener('click', async () => {
  if (faceTracker !== null) {
    faceTracker.close()
    faceTracker = null
    cameraEl.textContent = 'start camera'
    cameraVideoEl.hidden = true
    trackingValuesEl.textContent = 'camera off'
    resetViewScale()
    return
  }
  cameraEl.disabled = true
  cameraEl.textContent = 'loading…'
  try {
    resetViewScale()
    faceTracker = await MediaPipeFaceTracker.create(cameraVideoEl)
    animateEl.checked = false
    setMode('preview')
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

const gridCols = (): number => Math.min(64, Math.max(1, Math.floor(colsEl.valueAsNumber || 8)))
const gridRows = (): number => Math.min(64, Math.max(1, Math.floor(rowsEl.valueAsNumber || 6)))

rebuildRegionEl.addEventListener('click', () => {
  const region = currentMeshRegion()
  const part = activePart()
  const texture = textures.get(part.id)
  if (region === undefined || texture === undefined) return
  if (!confirm(`Rebuilding ${part.id} inside the green region resets all of its key poses. Continue?`)) {
    return
  }
  part.mesh = createGridMeshRegion(
    texture.width,
    texture.height,
    region.x1,
    region.y1,
    region.x2 - region.x1,
    region.y2 - region.y1,
    gridCols(),
    gridRows(),
  )
  for (const binding of part.bindings) {
    for (const keyframe of binding.keyframes) {
      keyframe.deltas = new Array<number>(part.mesh.vertices.length).fill(0)
    }
  }
  pinnedByPart.delete(part.id)
  clearSelection()
  clearHistory()
  rebuildScene()
})

$('#rebuild').addEventListener('click', () => {
  if (!confirm(`Rebuilding ${activePart().id} resets all of its key poses. Continue?`)) return
  const part = activePart()
  const texture = textures.get(part.id)
  if (texture === undefined) return
  part.mesh = createGridMesh(texture.width, texture.height, gridCols(), gridRows())
  for (const binding of part.bindings) {
    for (const keyframe of binding.keyframes) {
      keyframe.deltas = new Array<number>(part.mesh.vertices.length).fill(0)
    }
  }
  pinnedByPart.delete(part.id)
  meshRegions.delete(part.id)
  clearSelection()
  clearHistory()
  rebuildScene()
})

$('#reset-key').addEventListener('click', () => {
  if (mode !== 'edit') return
  const keyframe = activeKeyframe()
  const before = [...keyframe.deltas]
  keyframe.deltas.fill(0)
  pushHistory(makeHistoryEntry(before, [...keyframe.deltas]))
  refresh()
})

imageInput.addEventListener('change', async () => {
  const file = imageInput.files?.[0]
  if (file === undefined) return
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const part = activePart()
    const oldTexture = textures.get(part.id)
    textures.set(part.id, Texture.from(image))
    part.texture = file.name
    part.mesh = createGridMesh(image.naturalWidth, image.naturalHeight, gridCols(), gridRows())
    for (const binding of part.bindings) {
      for (const keyframe of binding.keyframes) {
        keyframe.deltas = new Array<number>(part.mesh.vertices.length).fill(0)
      }
    }
    pinnedByPart.delete(part.id)
    meshRegions.delete(part.id)
    clearSelection()
    clearHistory()
    rebuildScene()
    oldTexture?.destroy(true)
  } catch (error) {
    alert(`Image load failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    URL.revokeObjectURL(url)
    imageInput.value = ''
  }
})

$('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'model.json'
  link.click()
  URL.revokeObjectURL(link.href)
})

modelInput.addEventListener('change', async () => {
  const file = modelInput.files?.[0]
  if (file === undefined) return
  try {
    const imported = validateModel(JSON.parse(await file.text()))
    for (const part of imported.parts) {
      if (!textures.has(part.id)) {
        throw new Error(`no loaded texture matches part "${part.id}"`)
      }
    }
    adoptModel(imported)
  } catch (error) {
    alert(`Import failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    modelInput.value = ''
  }
})

// --- boot ---------------------------------------------------------------

const initialModel = await loadModel(DEFAULT_MODEL_URL)
const modelUrl = new URL(DEFAULT_MODEL_URL, location.href)
for (const part of initialModel.parts) {
  textures.set(part.id, await Assets.load<Texture>(new URL(part.texture, modelUrl).href))
}
adoptModel(initialModel)
setMode('edit')
