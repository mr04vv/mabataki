import { Application, Assets, Container, Texture } from 'pixi.js'
import {
  loadModel,
  MabatakiRuntime,
  MotionMixer,
  ParameterComposer,
} from '@mabataki/core'
import { PixiAvatarRenderer } from '@mabataki/pixi'
import { captureCanvasStream, combineWithAudio } from '@mabataki/web'

import {
  audioLevelToMouthOpen,
  smoothMouthOpen,
} from './audio-lip-sync.js'
import { MOTION_PRESETS } from './motion-presets.js'
import type { MotionPresetId } from './motion-presets.js'

const MODEL_URL = '/models/character/model.json'
const OUTPUT_FRAME_RATE = 30
const STAGE_SIZE = 570

function $<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (element === null) throw new Error(`missing element: ${selector}`)
  return element
}

function audioLevel(analyser: AnalyserNode, samples: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(samples)
  let sum = 0
  for (const sample of samples) sum += sample * sample
  return Math.sqrt(sum / samples.length)
}

function createMockTtsBuffer(context: AudioContext, text: string): AudioBuffer {
  const characters = [...text.trim() || 'Mabataki']
  const secondsPerCharacter = 0.095
  const duration = Math.max(1.2, Math.min(10, characters.length * secondsPerCharacter))
  const buffer = context.createBuffer(1, Math.ceil(duration * context.sampleRate), context.sampleRate)
  const channel = buffer.getChannelData(0)
  let phase = 0

  for (let index = 0; index < channel.length; index++) {
    const time = index / context.sampleRate
    const characterIndex = Math.min(
      characters.length - 1,
      Math.floor(time / secondsPerCharacter),
    )
    const code = characters[characterIndex].codePointAt(0) ?? 0
    const withinCharacter = time % secondsPerCharacter / secondsPerCharacter
    const isPause = /[\s、。,.!?！？]/u.test(characters[characterIndex])
    const envelope = isPause ? 0 : Math.sin(Math.PI * withinCharacter) ** 0.65
    const fundamental = 115 + code % 7 * 9 + Math.sin(time * 2.7) * 5
    phase += 2 * Math.PI * fundamental / context.sampleRate
    const voice = Math.sin(phase) * 0.55 + Math.sin(phase * 2.03) * 0.2
    channel[index] = voice * envelope * 0.24
  }

  return buffer
}

async function createWebRtcLoopback(
  stream: MediaStream,
  video: HTMLVideoElement,
  onStateChange: (state: RTCPeerConnectionState) => void,
): Promise<() => void> {
  const sender = new RTCPeerConnection()
  const receiver = new RTCPeerConnection()

  sender.addEventListener('icecandidate', ({ candidate }) => {
    if (candidate !== null) void receiver.addIceCandidate(candidate)
  })
  receiver.addEventListener('icecandidate', ({ candidate }) => {
    if (candidate !== null) void sender.addIceCandidate(candidate)
  })
  receiver.addEventListener('track', ({ streams, track }) => {
    video.srcObject = streams[0] ?? new MediaStream([track])
    void video.play().catch(() => {
      // Browser autoplay policy may require the user to press play in the video controls.
    })
  })
  receiver.addEventListener('connectionstatechange', () => {
    onStateChange(receiver.connectionState)
  })

  for (const track of stream.getTracks()) sender.addTrack(track, stream)
  const offer = await sender.createOffer()
  await sender.setLocalDescription(offer)
  await receiver.setRemoteDescription(offer)
  const answer = await receiver.createAnswer()
  await receiver.setLocalDescription(answer)
  await sender.setRemoteDescription(answer)

  return () => {
    sender.close()
    receiver.close()
  }
}

const stageEl = $('#stage')
const statusEl = $('#status')
const replyEl = $<HTMLTextAreaElement>('#reply')
const audioFileEl = $<HTMLInputElement>('#audio-file')
const startCallEl = $<HTMLButtonElement>('#start-call')
const speakEl = $<HTMLButtonElement>('#speak')
const mouthMeterEl = $('#mouth-meter')
const remoteVideoEl = $<HTMLVideoElement>('#remote-video')
const motionPresetEl = $<HTMLSelectElement>('#motion-preset')
const motionDescriptionEl = $('#motion-description')

const app = new Application()
await app.init({
  width: STAGE_SIZE,
  height: STAGE_SIZE,
  background: '#171c27',
  antialias: true,
})
stageEl.append(app.canvas)

const model = await loadModel(MODEL_URL)
const modelBaseUrl = new URL(MODEL_URL, location.href)
const textures = await Promise.all(model.parts.map((part) =>
  Assets.load<Texture>(new URL(part.texture, modelBaseUrl).href),
))
const runtime = new MabatakiRuntime(model)
const renderer = new PixiAvatarRenderer(runtime, textures)
const avatar = new Container()
avatar.addChild(renderer.container)
const modelWidth = Math.max(1, ...textures.map((texture) => texture.width))
const modelHeight = Math.max(1, ...textures.map((texture) => texture.height))
const scale = Math.min(STAGE_SIZE / modelWidth, STAGE_SIZE / modelHeight) * 0.94
const avatarCenterX = STAGE_SIZE / 2
const avatarCenterY = STAGE_SIZE / 2
avatar.pivot.set(model.origin?.x ?? modelWidth / 2, model.origin?.y ?? modelHeight / 2)
avatar.scale.set(scale)
avatar.position.set(avatarCenterX, avatarCenterY)
app.stage.addChild(avatar)

const baseParameters = Object.fromEntries(model.parameters.map((parameter) => [
  parameter.id,
  parameter.default,
]))
const parameterComposer = new ParameterComposer(model.parameters)
let motionMixer = new MotionMixer(MOTION_PRESETS.balloon.layers)

let audioContext: AudioContext | null = null
let analyser: AnalyserNode | null = null
let analyserSamples: Float32Array<ArrayBuffer> | null = null
let mediaDestination: MediaStreamAudioDestinationNode | null = null
let activeAudio: AudioBufferSourceNode | null = null
let stopLoopback: (() => void) | null = null
let elapsedMs = 0
let mouthOpen = 0

function setStatus(message: string): void {
  statusEl.textContent = message
}

function selectMotionPreset(): void {
  const id = motionPresetEl.value as MotionPresetId
  const preset = MOTION_PRESETS[id]
  motionMixer = new MotionMixer(preset.layers)
  motionDescriptionEl.textContent = preset.description
  elapsedMs = 0
}

motionPresetEl.addEventListener('change', selectMotionPreset)
selectMotionPreset()

async function selectedVoiceBuffer(context: AudioContext): Promise<AudioBuffer> {
  const file = audioFileEl.files?.[0]
  if (file === undefined) return createMockTtsBuffer(context, replyEl.value)
  return context.decodeAudioData(await file.arrayBuffer())
}

startCallEl.addEventListener('click', async () => {
  startCallEl.disabled = true
  setStatus('Starting audio graph and WebRTC participant…')
  try {
    audioContext = new AudioContext()
    await audioContext.resume()
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.25
    analyserSamples = new Float32Array(analyser.fftSize)
    mediaDestination = audioContext.createMediaStreamDestination()
    analyser.connect(mediaDestination)

    const videoStream = captureCanvasStream(app.canvas, OUTPUT_FRAME_RATE)
    const outgoingStream = combineWithAudio(videoStream, mediaDestination.stream)
    stopLoopback = await createWebRtcLoopback(
      outgoingStream,
      remoteVideoEl,
      (state) => setStatus(
        `Virtual participant: ${state} · ${outgoingStream.getVideoTracks().length} video + ` +
        `${outgoingStream.getAudioTracks().length} audio track`,
      ),
    )
    speakEl.disabled = false
    setStatus('Virtual participant created. Press “speak reply” to send audio and motion.')
  } catch (error) {
    startCallEl.disabled = false
    setStatus(`Could not start participant: ${error instanceof Error ? error.message : String(error)}`)
  }
})

speakEl.addEventListener('click', async () => {
  if (audioContext === null || analyser === null) return
  speakEl.disabled = true
  try {
    await audioContext.resume()
    activeAudio?.stop()
    const source = audioContext.createBufferSource()
    source.buffer = await selectedVoiceBuffer(audioContext)
    source.connect(analyser)
    source.addEventListener('ended', () => {
      if (activeAudio === source) activeAudio = null
      speakEl.disabled = false
      setStatus('Reply finished. Idle motion is still running.')
    })
    activeAudio = source
    source.start()
    setStatus(audioFileEl.files?.[0] === undefined
      ? 'Sending built-in mock TTS through the virtual participant…'
      : `Sending ${audioFileEl.files[0].name} through the virtual participant…`)
  } catch (error) {
    speakEl.disabled = false
    setStatus(`Could not play reply: ${error instanceof Error ? error.message : String(error)}`)
  }
})

app.ticker.add((ticker) => {
  const deltaMs = ticker.deltaMS
  elapsedMs += deltaMs
  const level = analyser !== null && analyserSamples !== null
    ? audioLevel(analyser, analyserSamples)
    : 0
  mouthOpen = smoothMouthOpen(mouthOpen, audioLevelToMouthOpen(level), deltaMs)
  const motion = motionMixer.sample(elapsedMs)
  runtime.update(parameterComposer.compose([
    { id: 'idle-motion', values: motion.parameters },
    { id: 'voice', values: { mouthOpen }, include: ['mouthOpen'] },
  ], baseParameters))
  runtime.step(deltaMs, motion.root)
  renderer.render()
  avatar.position.set(
    avatarCenterX + motion.root.translateX * scale,
    avatarCenterY + motion.root.translateY * scale,
  )
  avatar.rotation = motion.root.rotation
  avatar.scale.set(scale * motion.root.scaleX, scale * motion.root.scaleY)
  mouthMeterEl.style.width = `${Math.round(mouthOpen * 100)}%`
})

window.addEventListener('pagehide', () => {
  activeAudio?.stop()
  stopLoopback?.()
  if (audioContext !== null) void audioContext.close()
})

renderer.render()
setStatus('Model loaded. Start the virtual participant to create its outgoing MediaStream.')
