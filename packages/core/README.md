# @mabataki/core

Dependency-free, renderer-agnostic runtime for parameter-driven 2D avatars.

```ts
import { MabatakiRuntime } from '@mabataki/core'

const avatar = new MabatakiRuntime(model)
avatar.update({ mouthOpen: 0.8, headYaw: -0.2 })
const vertices = avatar.getPartVertices('face')
```

Tracking, rendering, camera composition, and WebRTC integration are separate packages.
