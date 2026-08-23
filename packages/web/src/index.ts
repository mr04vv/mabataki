/** Captures an avatar/compositor canvas as a video-only MediaStream. */
export function captureCanvasStream(
  canvas: HTMLCanvasElement,
  frameRate = 30,
): MediaStream {
  if (!Number.isFinite(frameRate) || frameRate <= 0) {
    throw new Error('frameRate must be a positive finite number')
  }
  return canvas.captureStream(frameRate)
}

/** Combines rendered video with audio for preview, recording, or transport. */
export function combineWithAudio(
  videoStream: MediaStream,
  audioStream: MediaStream,
): MediaStream {
  return new MediaStream([
    ...videoStream.getVideoTracks(),
    ...audioStream.getAudioTracks(),
  ])
}
