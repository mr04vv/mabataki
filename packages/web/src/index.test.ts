import { afterEach, describe, expect, it, vi } from 'vitest'

import { captureCanvasStream, combineWithAudio } from './index.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('captureCanvasStream', () => {
  it('captures the canvas at the requested frame rate', () => {
    const stream = {} as MediaStream
    const captureStream = vi.fn(() => stream)
    const canvas = { captureStream } as unknown as HTMLCanvasElement

    expect(captureCanvasStream(canvas, 60)).toBe(stream)
    expect(captureStream).toHaveBeenCalledWith(60)
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid frame rate %s',
    (frameRate) => {
      const canvas = {} as HTMLCanvasElement

      expect(() => captureCanvasStream(canvas, frameRate)).toThrow(
        'frameRate must be a positive finite number',
      )
    },
  )
})

describe('combineWithAudio', () => {
  it('keeps video tracks from the canvas and audio tracks from the microphone', () => {
    const videoTrack = { kind: 'video' } as MediaStreamTrack
    const audioTrack = { kind: 'audio' } as MediaStreamTrack
    const videoStream = {
      getVideoTracks: () => [videoTrack],
    } as MediaStream
    const audioStream = {
      getAudioTracks: () => [audioTrack],
    } as MediaStream

    class FakeMediaStream {
      constructor(readonly tracks: MediaStreamTrack[]) {}
    }

    vi.stubGlobal('MediaStream', FakeMediaStream)

    const result = combineWithAudio(videoStream, audioStream)

    expect(result).toBeInstanceOf(FakeMediaStream)
    expect((result as unknown as FakeMediaStream).tracks).toEqual([
      videoTrack,
      audioTrack,
    ])
  })
})
