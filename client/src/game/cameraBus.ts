// Lets DOM/UI code drive the in-canvas camera rig: recenter on the whole model
// ("Frame") or smoothly focus on a specific point (clicking an object).

type FrameCb = () => void
type FocusCb = (center: [number, number, number], radius: number) => void

let frameCb: FrameCb | null = null
let focusCb: FocusCb | null = null

export function registerFrame(cb: FrameCb): () => void {
  frameCb = cb
  return () => {
    if (frameCb === cb) frameCb = null
  }
}
export function frameObject() {
  frameCb?.()
}

export function registerFocus(cb: FocusCb): () => void {
  focusCb = cb
  return () => {
    if (focusCb === cb) focusCb = null
  }
}
/** Smoothly move the camera to look at `center` from a consistent distance. */
export function focusOn(center: [number, number, number], radius: number) {
  focusCb?.(center, radius)
}
