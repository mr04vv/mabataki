# mabataki

**A lightweight, web-first, headless runtime for parameter-driven 2D avatars.**

Mabataki turns tracker-agnostic parameters such as `mouthOpen` and `headYaw`
into deformed vertex buffers. Authoring tools, face trackers, and renderers stay
outside the dependency-free core, so applications can replace each of them
without changing the model execution path. The project deliberately targets a
smaller surface than a general-purpose puppet or animation ecosystem: portable
2D avatars embedded in browsers, real-time communication, and multi-avatar
applications.

**mabataki** (瞬き, "blink") is currently a proof of concept. It animates
human-authored artwork by interpolating between key poses — it does **not**
auto-rig anything. See [ADR-0015](docs/adr/0015-web-first-minimal-runtime.md)
for the positioning and alternatives behind this scope.

> Status: **v0.0.1 PoC** — a parameter-driven runtime and key-pose editor with
> head pose, mouth, independent blink tracking, and optional 3D face-filter demos.

## Quick start

```sh
pnpm install
pnpm dev
```

Open the printed URL. The bundled `man_55.png` character loads as one `face`
part whose mesh contains head pose, mouth, and independent blink bindings:

1. Select a **part**, **parameter**, and **key pose**. For `headYaw`, the keys
   are `-1`, `0`, and `1`.
2. In **edit** mode, drag blue handles to author the selected pose.
3. Move the parameter slider or enable **animate** to preview interpolation.
4. **image** replaces the selected part. **export json** / **import**
   round-trip the model data.

For larger edits, choose **box select**, then drag a rectangle around vertices.
Shift-drag adds to the selection and Option/Alt-drag removes from it. Switch
back to **move** to drag the selected vertices together. With **soft** enabled,
nearby purple vertices follow using the selected radius. Use the buttons or
Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z for undo and redo. **pin selected** marks
vertices red and excludes them from direct and soft-selection movement;
**unpin all** clears pins for the current part.

To concentrate vertices on a feature, choose **mesh region** and drag a green
rectangle around it. Set the grid size, then click **rebuild in region**. The
new mesh occupies only that rectangle while its UVs continue to reference the
full texture. Rebuilding changes the topology, so it resets every key pose for
the selected part; define the region before authoring deformations.

Click **start camera** to drive the preview with MediaPipe Face Landmarker.
The demo maps face landmarks and blendshapes to `headYaw`, `headRoll`,
`eyeOpenLeft`, `eyeOpenRight`, mouth opening, and smile parameters, then
smooths their values between frames. Camera processing
runs locally; the MediaPipe WASM and face model are fetched when tracking starts.

Open `/viewer.html` for the data-driven runtime demo. Unlike the editor, the
viewer fetches `apps/demo/public/models/character/model.json` and its texture files at
runtime. Use its file inputs to load another model together with every texture
file referenced by that model.

Open `/camera.html` for the camera compositor. It provides three deliberately
separate examples: glasses attached directly to the tracked face, the animated
avatar over the camera image, and the animated avatar over any uploaded background.
The background mode works without a camera; starting the camera adds expression
tracking without drawing the user or their room. Background selection, camera
placement, and scene layout all stay outside the headless runtime.

Open `/filters.html` for the 3D Filter Studio. It demonstrates a face-occluded
glasses accessory and an opaque full-face mask whose jaw follows `mouthOpen`.
The filter manifest owns face-relative placement while `@mabataki/ar` resolves
camera-space pose and `@mabataki/three` renders the asset. Import a `.glb` to
preview another model and tune its horizontal, vertical, depth, and scale values.

Open `/motion.html` to compare the `grounded`, `floating`, and `lively` motion
rules side by side, including the named `hover`, `balloon`, and `ghost` floating
styles. All use the same Core `MotionMixer`; only their declarative clips differ.
`/ai-call.html` defaults to `balloon` and lets you select every style alongside
audio-driven mouth movement.

### Accessory sizing

The camera compositor loads `glasses.svg` as a standalone tracked accessory;
it is not part of the bundled avatar model. Avatar parts should normally share
one canvas coordinate system so their neutral positions align without runtime
offsets. Camera tracking calibrates the first detected face width as scale `1`.
Enable **follow camera** to smoothly scale the renderer's root container as the
user moves closer or farther away; leave it off to keep the avatar framing fixed
while expressions continue tracking. The MediaPipe adapter returns runtime
parameters and this view transform separately, keeping global camera placement
outside the vertex-deformation core.

```sh
pnpm test        # all workspace tests (Vitest)
pnpm typecheck   # strict TypeScript checks per package
pnpm build       # packages, then the production demo
```

## Concept

The runtime accepts a **fixed, tracker-agnostic parameter contract** and blends
author-made keyframes per parameter:

```text
final[i] = base[i] + Σ_binding piecewiseLerp(binding.keyframes, params[binding.parameterId])[i]
```

- The runtime never guesses semantics ("this is a jaw", "this is hair").
  All deformation comes from model data, so non-human characters work the
  same way as human ones.
- Keyframes are a sorted list per binding, so 2 keys (`mouthOpen` 0/1) and
  3 keys (`headYaw` −1/0/+1) share one code path, and authors can insert
  intermediate keys (e.g. 0.5) to shape rotation-like arcs.
- Face tracking (MediaPipe etc.) and WebRTC stay **outside** the runtime,
  behind the parameter contract.

## Runtime API

The renderer-independent API validates a model, owns parameter state, and
returns reusable deformed-vertex buffers:

```ts
import { loadModel, MabatakiRuntime } from '@mabataki/core'

const model = await loadModel('/models/character/model.json')
const runtime = new MabatakiRuntime(model)

runtime.update({ headYaw: -0.4, mouthOpen: 0.72 })
runtime.step(16.7) // advance optional spring physics in milliseconds
const positions = runtime.getPartVertices('face')
```

Unknown update parameters are ignored so tracker output can be passed through
directly. Declared parameters are clamped to their model ranges. Treat the
returned `Float32Array` as read-only: the runtime reuses it on later updates.
Use `runtime.reset()` when replacing an input session, or `resetPhysics()` to
clear secondary-motion velocity while preserving the current parameters.

Compose independent inputs explicitly before updating the runtime:

```ts
import { ParameterComposer } from '@mabataki/core'

const composer = new ParameterComposer(model.parameters)
runtime.update(composer.compose([
  { id: 'tracking', values: tracking, include: ['headYaw', 'headRoll'] },
  { id: 'voice', values: { mouthOpen }, include: ['mouthOpen'] },
  { id: 'idle', values: idleParameters, blend: 'additive', weight: 0.2 },
]))
```

## Automatic motion

`MotionMixer` samples serializable clips without importing a renderer or owning
the animation clock. Parameter tracks drive authored key poses; root tracks
describe whole-avatar translation, rotation, and scale for the renderer to apply.

Common motion rules have typed factories. Their output is ordinary Motion Layer
data and can be mixed with fully custom clips:

```ts
import { createFloatingMotion, MotionPlayer } from '@mabataki/core'

const player = new MotionPlayer(createFloatingMotion({
  style: 'balloon',
  amplitudeX: 12,
  amplitudeY: 30,
  periodMs: 4000,
  variation: 0.16,
  seed: 42,
  rotation: 0.018,
  breathing: 0.01,
  weight: 0.8,
  speed: 1.1,
}))

player.transitionTo(createFloatingMotion({ style: 'hover' }), elapsedMs, 500)
const motion = player.sample(elapsedMs)
```

Floating factories generate several deterministically varied cycles before a
clip repeats. The same seed reproduces the same rhythm. Catmull–Rom tracks keep
velocity continuous through intermediate control points, while `MotionPlayer`
crossfades live preset changes without a root-transform jump.

```ts
import { MotionMixer } from '@mabataki/core'

const mixer = new MotionMixer([{
  blend: 'additive',
  clip: {
    id: 'float',
    durationMs: 2400,
    loop: true,
    tracks: [{
      target: { kind: 'root', property: 'translateY' },
      interpolation: 'catmull-rom',
      keyframes: [
        { timeMs: 0, value: 0 },
        { timeMs: 1200, value: -12 },
        { timeMs: 2400, value: 0 },
      ],
    }],
  },
}])

const motion = mixer.sample(elapsedMs, { mouthOpen: audioMouthOpen })
runtime.update(motion.parameters)
rendererRoot.y = neutralY + motion.root.translateY
```

Use Parameters for articulation, Root Motion for whole-character movement,
Spring Bindings for delayed ears/hair/tails, and the tracker adapter's view
transform for camera-space placement. See [ADR-0019](docs/adr/0019-declarative-motion-clips.md).

## Parameter contract (planned)

| id                        | range   | status      |
| ------------------------- | ------- | ----------- |
| `mouthOpen`               | 0..1    | implemented |
| `mouthSmileLeft` / `Right` | 0..1   | implemented |
| `eyeOpenLeft` / `Right`   | 0..1    | implemented |
| `gazeX` / `gazeY`         | −1..+1  | planned     |
| `headYaw`                  | −1..+1 | implemented |
| `headRoll`                 | −1..+1 | implemented |
| `headPitch`                | −1..+1 | planned     |

## Model format (v1, plain JSON)

```jsonc
{
  "version": 1,
  "origin": { "x": 284.5, "y": 285 }, // optional root rotation/scale pivot
  "parameters": [
    { "id": "mouthOpen", "min": 0, "max": 1, "default": 0 },
    { "id": "headYaw", "min": -1, "max": 1, "default": 0 }
  ],
  "parts": [
    {
      "id": "mouth",
      "texture": "mouth.png",           // reference only; not bundled yet
      "transform": { "x": 0, "y": 0, "pivotX": 50, "pivotY": 30 },
      "mesh": { "vertices": [/* x,y */], "uvs": [/* u,v */], "indices": [/* tris */] },
      "bindings": [
        {
          "parameterId": "mouthOpen",
          "keyframes": [
            { "value": 0, "deltas": [/* dx,dy per vertex */] },
            { "value": 1, "deltas": [/* dx,dy per vertex */] }
          ]
        }
      ],
      "transformBindings": [
        {
          "parameterId": "headYaw",
          "keyframes": [
            { "value": -1, "transform": { "x": -8, "rotation": -0.08 } },
            { "value": 1, "transform": { "x": 8, "rotation": 0.08 } }
          ]
        }
      ],
      "transformSpringBindings": [
        {
          "source": { "kind": "root", "property": "translateY" },
          "property": "y",
          "frequencyHz": 2.2, "dampingRatio": 0.58, "scale": 0.35
        }
      ]
    }
  ]
}
```

Vertex positions and transforms are in model space. `parentId` forms an acyclic
rigid hierarchy; omitted transforms are identity. `maskId` references another
Part used by the renderer as a geometry clip mask. Vertex `springBindings` remain
available for weighted flexible meshes, while `transformSpringBindings` move a
whole attached Part in response to a Parameter, parent transform, or Root Motion. A
compact binary/packaged format is deliberately deferred until the quality
hypothesis holds.

## Layout

- `packages/core/` — publishable `@mabataki/core`: model validation, parameter
  state, deformation, physics, and smoothing. It has zero package dependencies.
- `packages/ar/` — renderer- and tracker-independent 3D face-filter manifests,
  tracking-frame contracts, validation, and face-relative pose resolution.
- `packages/mediapipe/` — optional face tracking, calibration, landmarks, and accessory anchors.
- `packages/pixi/` — reusable PixiJS mesh renderer for Core vertex buffers.
- `packages/three/` — Three.js rendering and glTF/Morph Target integration for
  `@mabataki/ar` face filters.
- `packages/web/` — browser helpers for Canvas capture and microphone-track composition.
- `apps/demo/` — Editor, Viewer, Camera Compositor, 3D Filter Studio, Motion Lab,
  AI participant preview, and sample assets.
- `docs/adr/` — architecture decision records: why the design is the way it is.

The dependency direction is one-way: applications compose optional packages;
`@mabataki/pixi` depends on Core, and `@mabataki/three` depends on AR. Neither
headless package imports MediaPipe, a renderer, camera code, or WebRTC integration.
See [ADR-0018](docs/adr/0018-pnpm-workspace-package-boundaries.md).

## Product integration

Render an avatar with `@mabataki/core` and `@mabataki/pixi`, then pass the
Canvas stream to the product's existing WebRTC stack. `@mabataki/web` does not
own signaling or rooms; it only prepares browser media streams.

```ts
import { captureCanvasStream, combineWithAudio } from '@mabataki/web'

const video = captureCanvasStream(canvas, 30)
const outgoing = combineWithAudio(video, microphoneStream)
```

## Roadmap

mouth → head yaw/roll + multi-part authoring → independent blink →
accessories + camera-space scale → head pitch → gaze + clipping → position →
spring-driven hair/ear assets →
browser `MediaStream` output → multi-avatar benchmarks → authoring polish.

## Non-goals

Auto-rigging in core, full-body puppeteering, AI model generation, tracking or
WebRTC inside the runtime, UI-framework bindings in core.

## License

MIT
