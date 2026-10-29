import { Application, Assets, Container, Texture } from 'pixi.js'
import {
  createFloatingMotion,
  loadModel,
  MabatakiRuntime,
  MotionPlayer,
} from '@mabataki/core'
import type { MotionLayer } from '@mabataki/core'
import { PixiAvatarRenderer } from '@mabataki/pixi'

import {
  FLOATING_DIRECTIONS,
  FLOATING_DIRECTION_IDS,
} from './floating-directions.js'
import {
  MOTION_LAB_PRESETS,
  MOTION_LAB_PRESET_IDS,
} from './motion-presets.js'

const MODEL_URL = '/models/character/model.json'
const STAGE_SIZE = 360

interface PreviewController {
  setLayers(layers: readonly MotionLayer[]): void
}

function $<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (element === null) throw new Error(`missing element: ${selector}`)
  return element
}

const floatXEl = $<HTMLInputElement>('#float-x')
const floatYEl = $<HTMLInputElement>('#float-y')
const floatPeriodEl = $<HTMLInputElement>('#float-period')
const floatVariationEl = $<HTMLInputElement>('#float-variation')
const floatXValueEl = $<HTMLOutputElement>('#float-x-value')
const floatYValueEl = $<HTMLOutputElement>('#float-y-value')
const floatPeriodValueEl = $<HTMLOutputElement>('#float-period-value')
const floatVariationValueEl = $<HTMLOutputElement>('#float-variation-value')
const floatRerollEl = $<HTMLButtonElement>('#float-reroll')
const floatSeedEl = $('#float-seed')
let floatSeed = 42

const model = await loadModel(MODEL_URL)
const modelBaseUrl = new URL(MODEL_URL, location.href)
const textures = await Promise.all(model.parts.map((part) =>
  Assets.load<Texture>(new URL(part.texture, modelBaseUrl).href),
))
const modelWidth = Math.max(1, ...textures.map((texture) => texture.width))
const modelHeight = Math.max(1, ...textures.map((texture) => texture.height))
const baseParameters = Object.fromEntries(model.parameters.map((parameter) => [
  parameter.id,
  parameter.default,
]))

async function mountPreview(
  card: HTMLElement,
  layers: readonly MotionLayer[],
  descriptionText: string,
): Promise<PreviewController> {
  const stage = card.querySelector<HTMLElement>('.stage')
  const description = card.querySelector<HTMLElement>('.description')
  const values = card.querySelector<HTMLElement>('.values')
  if (stage === null || description === null || values === null) {
    throw new Error('incomplete motion preview card')
  }

  const app = new Application()
  await app.init({
    width: STAGE_SIZE,
    height: STAGE_SIZE,
    background: '#171c27',
    antialias: true,
  })
  stage.append(app.canvas)

  const runtime = new MabatakiRuntime(model)
  const renderer = new PixiAvatarRenderer(runtime, textures)
  const avatar = new Container()
  avatar.addChild(renderer.container)
  avatar.pivot.set(model.origin?.x ?? modelWidth / 2, model.origin?.y ?? modelHeight / 2)
  avatar.position.set(STAGE_SIZE / 2, STAGE_SIZE / 2)
  const baseScale = Math.min(STAGE_SIZE / modelWidth, STAGE_SIZE / modelHeight) * 0.88
  avatar.scale.set(baseScale)
  app.stage.addChild(avatar)

  const player = new MotionPlayer(layers)
  let elapsedMs = 0
  description.textContent = descriptionText

  app.ticker.add((ticker) => {
    elapsedMs += ticker.deltaMS
    const motion = player.sample(elapsedMs, baseParameters)
    runtime.update(motion.parameters)
    runtime.step(ticker.deltaMS, motion.root)
    renderer.render()
    avatar.position.set(
      STAGE_SIZE / 2 + motion.root.translateX * baseScale,
      STAGE_SIZE / 2 + motion.root.translateY * baseScale,
    )
    avatar.rotation = motion.root.rotation
    avatar.scale.set(
      baseScale * motion.root.scaleX,
      baseScale * motion.root.scaleY,
    )
    values.textContent =
      `x ${motion.root.translateX.toFixed(1)} · ` +
      `y ${motion.root.translateY.toFixed(1)} · ` +
      `rot ${motion.root.rotation.toFixed(3)}`
  })

  return {
    setLayers(nextLayers): void {
      player.transitionTo(nextLayers, elapsedMs, 400, baseParameters)
    },
  }
}

for (const id of FLOATING_DIRECTION_IDS) {
  const card = document.querySelector<HTMLElement>(`[data-floating-direction="${id}"]`)
  if (card === null) throw new Error(`missing floating direction card: ${id}`)
  const direction = FLOATING_DIRECTIONS[id]
  await mountPreview(card, direction.layers, direction.description)
}

let configurableFloating: PreviewController | null = null
for (const id of MOTION_LAB_PRESET_IDS) {
  const card = document.querySelector<HTMLElement>(`[data-motion="${id}"]`)
  if (card === null) throw new Error(`missing motion card: ${id}`)
  const preset = MOTION_LAB_PRESETS[id]
  const controller = await mountPreview(card, preset.layers, preset.description)
  if (id === 'floating') configurableFloating = controller
}

function updateFloatingSettings(): void {
  floatXValueEl.value = String(floatXEl.valueAsNumber)
  floatYValueEl.value = String(floatYEl.valueAsNumber)
  floatPeriodValueEl.value = `${(floatPeriodEl.valueAsNumber / 1000).toFixed(1)}s`
  floatVariationValueEl.value = `${Math.round(floatVariationEl.valueAsNumber * 100)}%`
  floatSeedEl.textContent = String(floatSeed)
  configurableFloating?.setLayers(createFloatingMotion({
    amplitudeX: floatXEl.valueAsNumber,
    amplitudeY: floatYEl.valueAsNumber,
    periodMs: floatPeriodEl.valueAsNumber,
    variation: floatVariationEl.valueAsNumber,
    seed: floatSeed,
  }))
}

floatXEl.addEventListener('input', updateFloatingSettings)
floatYEl.addEventListener('input', updateFloatingSettings)
floatPeriodEl.addEventListener('input', updateFloatingSettings)
floatVariationEl.addEventListener('input', updateFloatingSettings)
floatRerollEl.addEventListener('click', () => {
  floatSeed = Math.floor(Math.random() * 1_000_000)
  updateFloatingSettings()
})
updateFloatingSettings()
