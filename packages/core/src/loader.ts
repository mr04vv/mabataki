import type { MabatakiModel } from './model.js'
import { validateModel } from './model.js'

export async function loadModel(url: string, init?: RequestInit): Promise<MabatakiModel> {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`failed to load model: ${response.status} ${url}`)
  return validateModel(await response.json())
}
