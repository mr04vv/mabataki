# @mabataki/core

Dependency-free, renderer-agnostic runtime for parameter-driven 2D avatars.

```ts
import { MabatakiRuntime } from '@mabataki/core'

const avatar = new MabatakiRuntime(model)
avatar.update({ mouthOpen: 0.8, headYaw: -0.2 })
const vertices = avatar.getPartVertices('face')
const handPose = avatar.getPartPose('hand')
```

`PartPose` contains the reusable vertex buffer, local rigid transform,
`parentId`, and `maskId`. Call `reset()` to restore defaults or
`resetPhysics()` when tracking reconnects without changing parameters.

Compose input ownership before updating the runtime:

```ts
import { ParameterComposer } from '@mabataki/core'

const composer = new ParameterComposer(model.parameters)
avatar.update(composer.compose([
  { id: 'tracking', values: tracking, include: ['headYaw', 'headRoll'] },
  { id: 'voice', values: { mouthOpen }, include: ['mouthOpen'] },
]))
```

Automatic motion remains data-driven:

```ts
import { createFloatingMotion, MotionMixer } from '@mabataki/core'

const motion = new MotionMixer(createFloatingMotion({
  style: 'balloon',
  amplitudeX: 12,
  amplitudeY: 30,
  periodMs: 4000,
}))

const frame = motion.sample(elapsedMs)
avatar.step(deltaMs, frame.root) // lets attached physics react to root motion
```

Choose `hover`, `balloon`, or `ghost` as a starting style. Every amplitude and
period option can still override that style without adding runtime branches.

Tracking, rendering, camera composition, and media transport stay outside Core.
