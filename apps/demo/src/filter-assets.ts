import {
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three'
import type { FaceFilterManifest } from '@mabataki/ar'
import type { ThreeFaceFilterObject } from '@mabataki/three'
import { disposeObject } from '@mabataki/three'

export const GLASSES_FILTER: FaceFilterManifest = {
  version: 1,
  id: 'studio-glasses',
  name: 'Studio Glasses',
  kind: 'accessory',
  trackingAnchor: 'eyes',
  asset: { type: 'builtin', src: 'studio-glasses' },
  modelFaceWidth: 2,
  transform: {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: 1.08,
  },
  occlusion: 'face',
}

export const ROBOT_MASK_FILTER: FaceFilterManifest = {
  version: 1,
  id: 'chrome-mask',
  name: 'Chrome Mask',
  kind: 'face-mask',
  trackingAnchor: 'face',
  asset: { type: 'builtin', src: 'chrome-mask' },
  modelFaceWidth: 2,
  transform: {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: 1.08,
  },
  occlusion: 'none',
  expressions: { mouthOpen: 'JawOpen' },
}

export const FILTERS = [GLASSES_FILTER, ROBOT_MASK_FILTER] as const

function createGlasses(): ThreeFaceFilterObject {
  const root = new Group()
  const frameMaterial = new MeshPhysicalMaterial({
    color: 0x10131b,
    metalness: 0.88,
    roughness: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
  })
  const accentMaterial = new MeshPhysicalMaterial({
    color: 0xd8b45b,
    metalness: 0.96,
    roughness: 0.18,
  })
  const lensMaterial = new MeshPhysicalMaterial({
    color: 0x88d7ff,
    transparent: true,
    opacity: 0.2,
    roughness: 0.05,
    metalness: 0.05,
    side: DoubleSide,
    depthWrite: false,
  })

  for (const side of [-1, 1]) {
    const frame = new Mesh(new TorusGeometry(0.38, 0.055, 16, 64), frameMaterial)
    frame.position.set(side * 0.47, 0, 0.48)
    frame.scale.set(1.14, 0.76, 1)
    frame.renderOrder = 2
    root.add(frame)

    const lens = new Mesh(new CircleGeometry(0.35, 64), lensMaterial)
    lens.position.set(side * 0.47, 0, 0.47)
    lens.scale.set(1.14, 0.76, 1)
    lens.renderOrder = 3
    root.add(lens)

    const hinge = new Mesh(new CylinderGeometry(0.06, 0.06, 0.16, 20), accentMaterial)
    hinge.rotation.z = Math.PI / 2
    hinge.position.set(side * 0.94, 0, 0.42)
    hinge.renderOrder = 2
    root.add(hinge)

    const arm = new Mesh(new BoxGeometry(0.075, 0.075, 1.25), frameMaterial)
    arm.position.set(side * 0.98, 0.02, -0.08)
    arm.rotation.y = side * 0.08
    arm.renderOrder = 1
    root.add(arm)
  }

  const bridge = new Mesh(new CylinderGeometry(0.045, 0.045, 0.28, 20), accentMaterial)
  bridge.rotation.z = Math.PI / 2
  bridge.position.set(0, 0.02, 0.5)
  bridge.renderOrder = 2
  root.add(bridge)

  // Depth-only face proxy hides temple arms when they pass behind the head.
  const occluderMaterial = new MeshBasicMaterial({ color: 0x000000 })
  occluderMaterial.colorWrite = false
  occluderMaterial.depthWrite = true
  const occluder = new Mesh(new SphereGeometry(1, 48, 32), occluderMaterial)
  occluder.name = 'FaceOccluder'
  occluder.scale.set(0.92, 1.16, 0.64)
  occluder.position.z = -0.08
  occluder.renderOrder = 0
  root.add(occluder)

  return { root, dispose: () => disposeObject(root) }
}

function createRobotMask(): ThreeFaceFilterObject {
  const root = new Group()
  const shellMaterial = new MeshPhysicalMaterial({
    color: 0xb7c4d4,
    metalness: 0.82,
    roughness: 0.24,
    clearcoat: 0.75,
    clearcoatRoughness: 0.18,
  })
  const darkMaterial = new MeshPhysicalMaterial({
    color: 0x111827,
    metalness: 0.92,
    roughness: 0.3,
  })
  const lightMaterial = new MeshPhysicalMaterial({
    color: 0x82f7ff,
    emissive: 0x20d9ff,
    emissiveIntensity: 4,
    metalness: 0.25,
    roughness: 0.18,
  })
  const accentMaterial = new MeshPhysicalMaterial({
    color: 0x715aff,
    emissive: 0x2f1d9c,
    emissiveIntensity: 1.4,
    metalness: 0.65,
    roughness: 0.22,
  })

  const shell = new Mesh(new SphereGeometry(1, 64, 44), shellMaterial)
  shell.scale.set(0.96, 1.18, 0.68)
  shell.position.z = -0.03
  root.add(shell)

  const centerPlate = new Mesh(new BoxGeometry(0.2, 0.72, 0.12), accentMaterial)
  centerPlate.position.set(0, 0.42, 0.69)
  root.add(centerPlate)

  for (const side of [-1, 1]) {
    const eye = new Mesh(new BoxGeometry(0.55, 0.14, 0.09), lightMaterial)
    eye.position.set(side * 0.38, 0.26, 0.66)
    eye.rotation.z = side * -0.08
    root.add(eye)

    const cheek = new Mesh(new BoxGeometry(0.48, 0.56, 0.16), darkMaterial)
    cheek.position.set(side * 0.55, -0.2, 0.57)
    cheek.rotation.z = side * 0.16
    root.add(cheek)

    const sidePanel = new Mesh(new BoxGeometry(0.16, 0.74, 0.42), accentMaterial)
    sidePanel.position.set(side * 0.92, 0.02, 0.12)
    sidePanel.rotation.z = side * 0.08
    root.add(sidePanel)
  }

  const jaw = new Group()
  jaw.name = 'Jaw'
  jaw.position.set(0, -0.7, 0.47)
  const jawShell = new Mesh(new BoxGeometry(1.08, 0.34, 0.32), darkMaterial)
  jaw.add(jawShell)
  const jawLight = new Mesh(new BoxGeometry(0.48, 0.055, 0.34), lightMaterial)
  jawLight.position.set(0, 0.02, 0.18)
  jaw.add(jawLight)
  root.add(jaw)

  return {
    root,
    updateExpressions: (expressions) => {
      const mouthOpen = Math.min(1, Math.max(0, expressions.mouthOpen ?? 0))
      jaw.position.y = -0.7 - mouthOpen * 0.24
      jaw.rotation.x = -mouthOpen * 0.2
      lightMaterial.emissiveIntensity = 3.5 + mouthOpen * 3
    },
    dispose: () => disposeObject(root),
  }
}

export function createBuiltinFilter(id: string): ThreeFaceFilterObject {
  if (id === GLASSES_FILTER.asset.src) return createGlasses()
  if (id === ROBOT_MASK_FILTER.asset.src) return createRobotMask()
  throw new Error(`unknown builtin face filter: ${id}`)
}
