export interface ParameterDef {
  id: string
  min: number
  max: number
  default: number
}

/** Model-space pivot used for whole-avatar rotation and scaling. */
export interface ModelOrigin {
  x: number
  y: number
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

/** Local transform relative to the parent part or avatar root. */
export interface PartTransform {
  x: number
  y: number
  rotation: number
  scaleX: number
  scaleY: number
  pivotX: number
  pivotY: number
}

export type PartTransformProperty = 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY'

export interface PartTransformDelta {
  x?: number
  y?: number
  rotation?: number
  /** Additive difference from the base scale; 0 is neutral. */
  scaleX?: number
  /** Additive difference from the base scale; 0 is neutral. */
  scaleY?: number
}

export interface PartTransformKeyframe {
  value: number
  transform: PartTransformDelta
}

/** Parameter-driven rigid transform key poses for a whole part. */
export interface PartTransformBinding {
  parameterId: string
  keyframes: PartTransformKeyframe[]
}

export type TransformSpringSource =
  | { kind: 'parameter'; id: string }
  | { kind: 'root'; property: 'translateX' | 'translateY' | 'rotation' }
  | { kind: 'parent'; property: 'x' | 'y' | 'rotation' }

/** Adds delayed parent/root/parameter motion to a rigid part transform. */
export interface TransformSpringBinding {
  source: TransformSpringSource
  property: 'x' | 'y' | 'rotation'
  frequencyHz: number
  dampingRatio: number
  scale: number
}

export interface Part {
  id: string
  /** Texture reference (file name); resolution is up to the loader. */
  texture: string
  /** Optional parent for rigid attachment. Must form an acyclic graph. */
  parentId?: string
  /** Neutral local transform. Omitted fields use the identity transform. */
  transform?: Partial<PartTransform>
  /** Optional part whose rendered alpha/geometry clips this part. */
  maskId?: string
  mesh: MeshData
  bindings: Binding[]
  transformBindings?: PartTransformBinding[]
  springBindings?: SpringBinding[]
  transformSpringBindings?: TransformSpringBinding[]
}

export interface MabatakiModel {
  version: 1
  origin?: ModelOrigin
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const TRANSFORM_FIELDS = [
  'x',
  'y',
  'rotation',
  'scaleX',
  'scaleY',
  'pivotX',
  'pivotY',
] as const

const TRANSFORM_DELTA_FIELDS = ['x', 'y', 'rotation', 'scaleX', 'scaleY'] as const

/**
 * Structurally validates untrusted model data (e.g. an imported JSON file)
 * and narrows it to `MabatakiModel`. Throws with a descriptive message.
 */
export function validateModel(model: unknown): MabatakiModel {
  assert(typeof model === 'object' && model !== null, 'model must be an object')
  const m = model as Record<string, unknown>
  assert(m.version === 1, `unsupported version: ${String(m.version)}`)

  if (m.origin !== undefined) {
    assert(typeof m.origin === 'object' && m.origin !== null, 'origin must be an object')
    const origin = m.origin as Record<string, unknown>
    assert(
      isFiniteNumber(origin.x) && isFiniteNumber(origin.y),
      'origin x/y must be finite numbers',
    )
  }

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
    assert(isRecord(raw), 'each part must be an object')
    assert(typeof raw.id === 'string' && raw.id.length > 0, 'part id must be a non-empty string')
    assert(!partIds.has(raw.id), `duplicate part "${raw.id}"`)
    partIds.add(raw.id)
  }

  const parentByPart = new Map<string, string>()
  for (const raw of m.parts) {
    const part = raw as Record<string, unknown>
    const partId = part.id as string
    assert(typeof part.texture === 'string', `part "${part.id}" texture must be a string`)

    if (part.parentId !== undefined) {
      assert(
        typeof part.parentId === 'string' && partIds.has(part.parentId),
        `part "${partId}" parentId must reference a declared part`,
      )
      assert(part.parentId !== partId, `part "${partId}" cannot parent itself`)
      parentByPart.set(partId, part.parentId)
    }

    if (part.maskId !== undefined) {
      assert(
        typeof part.maskId === 'string' && partIds.has(part.maskId),
        `part "${partId}" maskId must reference a declared part`,
      )
      assert(part.maskId !== partId, `part "${partId}" cannot mask itself`)
    }

    if (part.transform !== undefined) {
      assert(isRecord(part.transform), `part "${partId}" transform must be an object`)
      for (const field of TRANSFORM_FIELDS) {
        const value = part.transform[field]
        assert(
          value === undefined || isFiniteNumber(value),
          `part "${partId}" transform ${field} must be finite`,
        )
      }
    }

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

    if (part.transformBindings !== undefined) {
      assert(
        Array.isArray(part.transformBindings),
        `part "${partId}" transformBindings must be an array`,
      )
      for (const rawBinding of part.transformBindings) {
        assert(isRecord(rawBinding), 'each transform binding must be an object')
        assert(
          typeof rawBinding.parameterId === 'string' && parameterIds.has(rawBinding.parameterId),
          `transform binding references undeclared parameter "${String(rawBinding.parameterId)}"`,
        )
        assert(
          Array.isArray(rawBinding.keyframes) && rawBinding.keyframes.length > 0,
          `transform binding "${rawBinding.parameterId}" keyframes must be non-empty`,
        )
        let previousValue = Number.NEGATIVE_INFINITY
        for (const rawKeyframe of rawBinding.keyframes) {
          assert(isRecord(rawKeyframe), 'each transform keyframe must be an object')
          assert(
            isFiniteNumber(rawKeyframe.value) && rawKeyframe.value > previousValue,
            `transform binding "${rawBinding.parameterId}" keyframes must be sorted`,
          )
          assert(
            isRecord(rawKeyframe.transform),
            `transform binding "${rawBinding.parameterId}" transform must be an object`,
          )
          for (const field of TRANSFORM_DELTA_FIELDS) {
            const value = rawKeyframe.transform[field]
            assert(
              value === undefined || isFiniteNumber(value),
              `transform binding "${rawBinding.parameterId}" ${field} must be finite`,
            )
          }
          previousValue = rawKeyframe.value
        }
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

    if (part.transformSpringBindings !== undefined) {
      assert(
        Array.isArray(part.transformSpringBindings),
        `part "${partId}" transformSpringBindings must be an array`,
      )
      for (const rawSpring of part.transformSpringBindings) {
        assert(isRecord(rawSpring), 'each transform spring binding must be an object')
        assert(isRecord(rawSpring.source), 'transform spring source must be an object')
        const source = rawSpring.source
        if (source.kind === 'parameter') {
          assert(
            typeof source.id === 'string' && parameterIds.has(source.id),
            `transform spring references undeclared parameter "${String(source.id)}"`,
          )
        } else if (source.kind === 'root') {
          assert(
            source.property === 'translateX' ||
              source.property === 'translateY' ||
              source.property === 'rotation',
            `part "${partId}" transform spring has an unknown root property`,
          )
        } else {
          assert(source.kind === 'parent', `part "${partId}" transform spring has an unknown source`)
          assert(parentByPart.has(partId), `part "${partId}" parent spring requires parentId`)
          assert(
            source.property === 'x' || source.property === 'y' || source.property === 'rotation',
            `part "${partId}" transform spring has an unknown parent property`,
          )
        }
        assert(
          rawSpring.property === 'x' ||
            rawSpring.property === 'y' ||
            rawSpring.property === 'rotation',
          `part "${partId}" transform spring has an unknown target property`,
        )
        assert(
          isFiniteNumber(rawSpring.frequencyHz) && rawSpring.frequencyHz > 0,
          `part "${partId}" transform spring frequencyHz must be positive`,
        )
        assert(
          isFiniteNumber(rawSpring.dampingRatio) && rawSpring.dampingRatio >= 0,
          `part "${partId}" transform spring dampingRatio must be non-negative`,
        )
        assert(
          isFiniteNumber(rawSpring.scale),
          `part "${partId}" transform spring scale must be finite`,
        )
      }
    }
  }

  for (const partId of partIds) {
    const ancestors = new Set<string>([partId])
    let parentId = parentByPart.get(partId)
    while (parentId !== undefined) {
      assert(!ancestors.has(parentId), `part hierarchy contains a cycle at "${parentId}"`)
      ancestors.add(parentId)
      parentId = parentByPart.get(parentId)
    }
  }

  return model as MabatakiModel
}
