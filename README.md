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
> multi-part head pose, mouth, and independent blink tracking demos.

## Quick start

```sh
pnpm install
pnpm dev
```

Open the printed URL. The bundled character loads as `face`, `eyes`, `glasses`,
and `mouth` parts. The glasses demonstrate an accessory that follows head pose
without inheriting blink deformation:

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
avatar over the camera image, and the animated avatar behind a segmented person.
The first two use face position and size from the adapter; the background mode
adds MediaPipe Image Segmenter only in the compositor. This keeps image masking,
camera placement, and scene layout out of the headless runtime.

### Accessory sizing

Author accessories on the same canvas as the character so their neutral size
and position line up without runtime offsets. The bundled glasses use a
four-vertex mesh and bind only to `headYaw` and `headRoll`, so they follow the
head without inheriting blink deformation. Camera tracking calibrates the first
detected face width as scale `1`. Enable **follow camera** to smoothly scale the
renderer's root container as the user moves closer or farther away; leave it
off to keep the avatar framing fixed while expressions continue tracking. The
MediaPipe adapter returns runtime parameters and this view transform separately,
keeping global camera placement outside the vertex-deformation core.

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
  "parameters": [{ "id": "mouthOpen", "min": 0, "max": 1, "default": 0 }],
  "parts": [
    {
      "id": "mouth",
      "texture": "mouth.png",           // reference only; not bundled yet
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
      "springBindings": [
        {
          "parameterId": "headYaw",
          "frequencyHz": 2.2,
          "dampingRatio": 0.58,
          "scaleX": 28,
          "scaleY": 5,
          "weights": [/* one 0..1 influence per vertex */]
        }
      ]
    }
  ]
}
```

Vertex positions and spring scales are in texture pixel space. Spring weights
pin attachment vertices at `0` and give free tips full influence at `1`. A
compact binary/packaged format is deliberately deferred until the quality
hypothesis holds.

## Layout

- `packages/core/` — publishable `@mabataki/core`: model validation, parameter
  state, deformation, physics, and smoothing. It has zero package dependencies.
- `packages/mediapipe/` — optional tracking, calibration, landmarks, and person segmentation.
- `packages/pixi/` — reusable PixiJS mesh renderer for Core vertex buffers.
- `packages/web/` — browser helpers for Canvas capture and microphone-track composition.
- `apps/demo/` — Editor, Runtime Viewer, Camera Compositor, and sample model assets.
- `docs/adr/` — architecture decision records: why the design is the way it is.

The dependency direction is one-way: applications compose optional packages,
while `@mabataki/core` never imports a tracker, renderer, or WebRTC integration.
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
`canvas.captureStream()` / WebRTC → multi-avatar benchmarks → authoring polish.

## Non-goals

Auto-rigging in core, full-body puppeteering, AI model generation, tracking or
WebRTC inside the runtime, UI-framework bindings in core.

## License

MIT
