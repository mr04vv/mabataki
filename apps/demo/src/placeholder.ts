/**
 * Draws a stand-in mouth texture so the editor works without any asset.
 * The layout mirrors the quality test from the design doc: upper teeth that
 * should stay pinned to the upper jaw while the lower side opens.
 */
export function drawPlaceholderMouth(width = 480, height = 360): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('2d canvas context unavailable')

  const cx = width / 2
  const cy = height * 0.55
  const rx = width * 0.36
  const ry = height * 0.33

  // mouth cavity
  ctx.fillStyle = '#5d1b28'
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()

  // upper teeth, clipped to the cavity
  ctx.save()
  ctx.clip()
  ctx.fillStyle = '#f4efe6'
  const teethTop = cy - ry
  const teethHeight = ry * 0.62
  ctx.fillRect(cx - rx, teethTop, rx * 2, teethHeight)
  ctx.strokeStyle = '#d5cabc'
  ctx.lineWidth = 3
  for (let i = 1; i < 6; i++) {
    const x = cx - rx + (rx * 2 * i) / 6
    ctx.beginPath()
    ctx.moveTo(x, teethTop)
    ctx.lineTo(x, teethTop + teethHeight)
    ctx.stroke()
  }
  ctx.restore()

  // lips
  ctx.strokeStyle = '#c94f63'
  ctx.lineWidth = 26
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.stroke()

  return canvas
}
