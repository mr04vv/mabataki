import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadModel } from './loader'

const validModel = {
  version: 1,
  parameters: [],
  parts: [],
}

describe('loadModel', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('fetches and validates a model', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(validModel)))
    vi.stubGlobal('fetch', fetchMock)
    await expect(loadModel('/model.json')).resolves.toEqual(validModel)
    expect(fetchMock).toHaveBeenCalledWith('/model.json', undefined)
  })

  it('forwards request options', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(validModel)))
    vi.stubGlobal('fetch', fetchMock)
    const init = { cache: 'no-cache' } as const
    await loadModel('/model.json', init)
    expect(fetchMock).toHaveBeenCalledWith('/model.json', init)
  })

  it('throws for an unsuccessful response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })))
    await expect(loadModel('/missing.json')).rejects.toThrow(/404.*missing/)
  })

  it('throws when the response is not a valid model', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')))
    await expect(loadModel('/bad.json')).rejects.toThrow(/model/)
  })
})
