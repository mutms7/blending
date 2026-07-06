// Lets DOM/UI code drive the in-canvas camera rig: recenter on the whole model
// ("Frame") or smoothly focus on a specific point (clicking an object).

import * as THREE from 'three'

/**
 * Live copy of the main camera's orientation, published every frame by the
 * CameraRig and read by the corner view-cube so the mini cube mirrors the scene
 * (like the navigation gizmo in Blender/Fusion).
 */
export const mainCameraQuat = new THREE.Quaternion()

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

type ViewCb = (dir: [number, number, number]) => void
let viewCb: ViewCb | null = null

export function registerView(cb: ViewCb): () => void {
  viewCb = cb
  return () => {
    if (viewCb === cb) viewCb = null
  }
}
/** View the whole model from a world-axis direction (from the view-cube). */
export function viewFromDirection(dir: [number, number, number]) {
  viewCb?.(dir)
}
