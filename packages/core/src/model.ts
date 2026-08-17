export interface ParameterDef {
  id: string
  min: number
  max: number
  default: number
}

/**
 * Mesh deformation at one parameter value.
 * `deltas` is a flat [dx, dy, ...] offset list relative to the base vertices.
 */
export interface Keyframe {
  value: number
  deltas: number[]
}

/**
 * Binds one parameter to a list of keyframes, sorted ascending by `value`.
 * The runtime interpolates piecewise-linearly between adjacent keyframes,
 * so 2 keys (mouthOpen 0/1) and 3 keys (headYaw -1/0/+1) use the same code path.
 */
export interface Binding {
  parameterId: string
  keyframes: Keyframe[]
}

export interface MeshData {
  /** Flat [x, y, ...] base positions in texture pixel space. */
  vertices: number[]
  /** Flat [u, v, ...] coordinates in 0..1. */
  uvs: number[]
  /** Triangle list into `vertices`. */
  indices: number[]
}

/**
 * Adds inertial vertex offsets driven by a parameter. `weights` contains one
 * 0..1 influence value per mesh vertex; zero pins an attachment point while
 * one gives a free tip the full spring response.
 */
export interface SpringBinding {
  parameterId: string
  frequencyHz: number
  dampingRatio: number
  scaleX: number
  scaleY: number
  weights: number[]
}

export interface Part {
  id: string
  /** Texture reference (file name); resolution is up to the loader. */
  texture: string
  mesh: MeshData
  bindings: Binding[]
  springBindings?: SpringBinding[]
}

export interface MabatakiModel {
  version: 1
  parameters: ParameterDef[]
  parts: Part[]
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`invalid model: ${message}`)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isFiniteNumber)
}

/**
 * Structurally validates untrusted model data (e.g. an imported JSON file)
 * and narrows it to `MabatakiModel`. Throws with a descriptive message.
 */
export function validateModel(model: unknown): MabatakiModel {
  assert(typeof model === 'object' && model !== null, 'model must be an object')
  const m = model as Record<string, unknown>
  assert(m.version === 1, `unsupported version: ${String(m.version)}`)

  assert(Array.isArray(m.parameters), 'parameters must be an array')
  const parameterIds = new Set<string>()
  for (const raw of m.parameters) {
    assert(typeof raw === 'object' && raw !== null, 'each parameter must be an object')
    const p = raw as Record<string, unknown>
    assert(typeof p.id === 'string' && p.id.length > 0, 'parameter id must be a non-empty string')
    assert(!parameterIds.has(p.id), `duplicate parameter "${p.id}"`)
    assert(
      isFiniteNumber(p.min) && isFiniteNumber(p.max) && isFiniteNumber(p.default),
      `parameter "${p.id}" min/max/default must be finite numbers`,
    )
    assert(
      p.min <= p.default && p.default <= p.max,
      `parameter "${p.id}" must satisfy min <= default <= max`,
    )
    parameterIds.add(p.id)
  }

  assert(Array.isArray(m.parts), 'parts must be an array')
  const partIds = new Set<string>()
  for (const raw of m.parts) {
    assert(typeof raw === 'object' && raw !== null, 'each part must be an object')
    const part = raw as Record<string, unknown>
    assert(typeof part.id === 'string' && part.id.length > 0, 'part id must be a non-empty string')
    assert(!partIds.has(part.id), `duplicate part "${part.id}"`)
    partIds.add(part.id)
    assert(typeof part.texture === 'string', `part "${part.id}" texture must be a string`)

    assert(typeof part.mesh === 'object' && part.mesh !== null, `part "${part.id}" mesh must be an object`)
    const mesh = part.mesh as Record<string, unknown>
    assert(
      isNumberArray(mesh.vertices) && mesh.vertices.length > 0 && mesh.vertices.length % 2 === 0,
      `part "${part.id}" vertices must be a non-empty flat [x, y, ...] array`,
    )
    assert(
      isNumberArray(mesh.uvs) && mesh.uvs.length === mesh.vertices.length,
      `part "${part.id}" uvs length must match vertices length`,
    )
    const vertexCount = mesh.vertices.length / 2
    assert(
      isNumberArray(mesh.indices) &&
        mesh.indices.length % 3 === 0 &&
        mesh.indices.every((i) => Number.isInteger(i) && i >= 0 && i < vertexCount),
      `part "${part.id}" indices must be triangles referencing valid vertices`,
    )

    assert(Array.isArray(part.bindings), `part "${part.id}" bindings must be an array`)
    for (const rawBinding of part.bindings) {
      assert(typeof rawBinding === 'object' && rawBinding !== null, 'each binding must be an object')
      const binding = rawBinding as Record<string, unknown>
      assert(
        typeof binding.parameterId === 'string' && parameterIds.has(binding.parameterId),
        `binding references undeclared parameter "${String(binding.parameterId)}"`,
      )
      assert(
        Array.isArray(binding.keyframes) && binding.keyframes.length > 0,
        `binding "${binding.parameterId}" keyframes must be a non-empty array`,
      )
      let previousValue = Number.NEGATIVE_INFINITY
      for (const rawKey of binding.keyframes) {
        assert(typeof rawKey === 'object' && rawKey !== null, 'each keyframe must be an object')
        const key = rawKey as Record<string, unknown>
        assert(isFiniteNumber(key.value), `binding "${binding.parameterId}" keyframe value must be finite`)
        assert(
          key.value > previousValue,
          `binding "${binding.parameterId}" keyframes must be sorted ascending by value`,
        )
        assert(
          isNumberArray(key.deltas) && key.deltas.length === mesh.vertices.length,
          `binding "${binding.parameterId}" keyframe deltas length must match vertices length`,
        )
        previousValue = key.value
      }
    }

    if (part.springBindings !== undefined) {
      assert(Array.isArray(part.springBindings), `part "${part.id}" springBindings must be an array`)
      for (const rawSpring of part.springBindings) {
        assert(typeof rawSpring === 'object' && rawSpring !== null, 'each spring binding must be an object')
        const spring = rawSpring as Record<string, unknown>
        assert(
          typeof spring.parameterId === 'string' && parameterIds.has(spring.parameterId),
          `spring binding references undeclared parameter "${String(spring.parameterId)}"`,
        )
        assert(
          isFiniteNumber(spring.frequencyHz) && spring.frequencyHz > 0,
          `spring binding "${spring.parameterId}" frequencyHz must be positive`,
        )
        assert(
          isFiniteNumber(spring.dampingRatio) && spring.dampingRatio >= 0,
          `spring binding "${spring.parameterId}" dampingRatio must be non-negative`,
        )
        assert(
          isFiniteNumber(spring.scaleX) && isFiniteNumber(spring.scaleY),
          `spring binding "${spring.parameterId}" scales must be finite`,
        )
        assert(
          isNumberArray(spring.weights) &&
            spring.weights.length === vertexCount &&
            spring.weights.every((weight) => weight >= 0 && weight <= 1),
          `spring binding "${spring.parameterId}" weights must contain one 0..1 value per vertex`,
        )
      }
    }
  }

  return model as MabatakiModel
}
