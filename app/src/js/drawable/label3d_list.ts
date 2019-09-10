import _ from 'lodash'
import * as THREE from 'three'
import { changeLabelProps, deleteLabel } from '../action/common'
import Session from '../common/session'
import { LabelTypes } from '../common/types'
import { State } from '../functional/types'
import { Box3D } from './box3d'
import { TransformationControl } from './control/transformation_control'
import { Cube3D } from './cube3d'
import { Label3D } from './label3d'
import { Plane3D } from './plane3d'

/**
 * Make a new drawable label based on the label type
 * @param {string} labelType: type of the new label
 */
function makeDrawableLabel (
  labelType: string, control: TransformationControl
): Label3D {
  switch (labelType) {
    case LabelTypes.BOX_3D:
      return new Box3D(control)
    case LabelTypes.PLANE_3D:
      return new Plane3D(control)
  }
  return new Box3D(control)
}

type Shape = Cube3D

/**
 * List of drawable labels
 * ViewController for the labels
 */
export class Label3DList {
  /** Scalabel id to labels */
  private _labels: {[labelId: number]: Label3D}
  /** ThreeJS Object id to labels */
  private _raycastMap: {[id: number]: Label3D}
  /** Recorded state of last update */
  private _state: State
  /** selected label */
  private _selectedLabel: Label3D | null
  /** highlighted label */
  private _highlightedLabel: Label3D | null
  /** whether mouse is down on the selected box */
  private _mouseDownOnSelection: boolean
  /** whether the selected label is changed */
  private _labelChanged: boolean
  /** List of ThreeJS objects for raycasting */
  private _raycastableShapes: Readonly<Array<Readonly<Shape>>>
  /** Plane visualization */
  private _plane?: Plane3D
  /** Camera */
  private _camera: THREE.Camera
  /** raycaster */
  private _raycaster: THREE.Raycaster
  /** transformation control */
  private _control: TransformationControl

  constructor (camera: THREE.Camera) {
    this._labels = {}
    this._raycastMap = {}
    this._selectedLabel = null
    this._highlightedLabel = null
    this._mouseDownOnSelection = false
    this._labelChanged = false
    this._raycastableShapes = []
    this._camera = camera
    this._raycaster = new THREE.Raycaster()
    this._raycaster.near = 1.0
    this._raycaster.far = 100.0
    this._raycaster.linePrecision = 0.02
    this._control = new TransformationControl(this._camera)
    if (Session.itemType === 'image') {
      this._plane = new Plane3D(this._control)
      this._plane.init(Session.getState())
    }
    this._state = Session.getState()
    this.updateState(this._state, this._state.user.select.item)
  }

  /**
   * Add labels to scene object
   * @param {THREE.Scene} scene: ThreeJS Scene Object
   */
  public render (scene: THREE.Scene): void {
    for (const id of Object.keys(this._labels)) {
      this._labels[Number(id)].render(scene)
    }
  }

  /**
   * update labels from the state
   */
  public updateState (state: State, itemIndex: number): void {
    this._state = state

    const newLabels: {[labelId: number]: Label3D} = {}
    const newRaycastableShapes: Array<Readonly<Shape>> = []
    const newRaycastMap: {[id: number]: Label3D} = {}
    const item = state.task.items[itemIndex]

    for (const key of Object.keys(item.labels)) {
      const id = Number(key)
      if (id in this._labels) {
        newLabels[id] = this._labels[id]
      } else {
        if (this._plane && item.labels[id].type === LabelTypes.PLANE_3D) {
          newLabels[id] = this._plane
        } else {
          newLabels[id] =
            makeDrawableLabel(item.labels[id].type, this._control)
          if (this._plane) {
            this._plane.attachLabel(newLabels[id])
          }
        }
      }
      newLabels[id].updateState(state, itemIndex, id)
      for (const shape of newLabels[id].shapes()) {
        newRaycastableShapes.push(shape as Shape)
        newRaycastMap[shape.id] = newLabels[id]
      }
    }

    this._raycastableShapes = newRaycastableShapes
    this._labels = newLabels
    this._raycastMap = newRaycastMap

    if (this._selectedLabel) {
      this._selectedLabel.setSelected(false)
    }
    if (state.user.select.label >= 0 &&
        (state.user.select.label in this._labels)) {
      this._selectedLabel = this._labels[state.user.select.label]
      this._selectedLabel.setSelected(true)
    } else {
      this._selectedLabel = null
    }
  }

  /**
   * Handle double click, select label for editing
   * @returns true if consumed, false otherwise
   */
  public onDoubleClick (): boolean {
    if (this._highlightedLabel !== null) {
      if (this._selectedLabel !== null &&
          this._selectedLabel !== this._highlightedLabel) {
        this._selectedLabel.setSelected(false)
      }
      this._highlightedLabel.setSelected(true)
      this._selectedLabel = this._highlightedLabel

      // Set current label as selected label
      Session.dispatch(changeLabelProps(
        this._state.user.select.item, this._selectedLabel.labelId, {}
      ))
      return true
    }
    return false
  }

  /**
   * Process mouse down action
   */
  public onMouseDown (): boolean {
    if (this._highlightedLabel === this._selectedLabel && this._selectedLabel) {
      this._control.onMouseDown()
      this._mouseDownOnSelection = true
    }
    return false
  }

  /**
   * Process mouse up action
   */
  public onMouseUp (): boolean {
    this._mouseDownOnSelection = false
    this._control.onMouseUp()
    if ((this._labelChanged || this._plane) && this._selectedLabel !== null) {
      this._selectedLabel.commitLabel()
    }
    this._labelChanged = false
    return false
  }

  /**
   * Process mouse move action
   * @param x NDC
   * @param y NDC
   * @param camera
   */
  public onMouseMove (
    x: number,
    y: number
  ): boolean {
    if (this._mouseDownOnSelection && this._selectedLabel) {
      this._control.onMouseMove(x, y)
      this._labelChanged = true
      return true
    } else {
      this.raycastLabels(x, y, this._camera, this._raycaster)
    }
    return false
  }

  /**
   * Handle keyboard events
   * @param {KeyboardEvent} e
   * @returns true if consumed, false otherwise
   */
  public onKeyDown (e: KeyboardEvent): boolean {
    switch (e.key) {
      case ' ':
        const state = this._state
        const label = new Box3D(this._control)
        label.init(state)
        return true
      case 'Escape':
      case 'Enter':
        if (this._selectedLabel !== null) {
          this._selectedLabel.setSelected(false)
          this._selectedLabel = null
          Session.dispatch(changeLabelProps(
            this._state.user.select.item, -1, {}
          ))
        }
        return true
      case 'Backspace':
        if (this._selectedLabel) {
          Session.dispatch(deleteLabel(
            this._state.user.select.item,
            this._state.user.select.label
          ))
        }
        return true
      case 'P':
      case 'p':
        if (this._plane) {
          if (this._selectedLabel === this._plane) {
            this._plane.setSelected(false)
            this._selectedLabel = null
            Session.dispatch(changeLabelProps(
              this._state.user.select.item, -1, {}
            ))
          } else {
            if (this._selectedLabel) {
              this._selectedLabel.setSelected(false)
            }
            this._plane.setSelected(true)
            Session.dispatch(changeLabelProps(
              this._state.user.select.item, this._plane.labelId, {}
            ))
          }
          return true
        }
        return false
    }
    if (this._selectedLabel !== null) {
      return this._selectedLabel.onKeyDown(e)
    }
    return false
  }

  /**
   * Handle key up
   */
  public onKeyUp (e: KeyboardEvent) {
    if (this._selectedLabel !== null) {
      return this._selectedLabel.onKeyUp(e)
    }
    return false
  }

  /**
   * Highlight label if ray from mouse is intersecting a label
   * @param object
   * @param point
   */
  private highlight (intersection: THREE.Intersection | null) {
    if (this._highlightedLabel) {
      this._highlightedLabel.setHighlighted()
      this._control.setHighlighted()
    }
    this._highlightedLabel = null

    if (intersection) {
      let object = intersection.object
      while (object.parent && !(object.id in this._raycastMap)) {
        object = object.parent
      }

      if (object.id in this._raycastMap) {
        this._highlightedLabel = this._raycastMap[object.id]
        this._highlightedLabel.setHighlighted(intersection)
        if (this._highlightedLabel === this._selectedLabel) {
          this._control.setHighlighted(intersection)
        }
        return
      }
    }
  }

  /**
   * Get raycastable list
   */
  private getRaycastableShapes (): Readonly<Array<Readonly<Shape>>> {
    return this._raycastableShapes
  }

  /**
   * Raycast labels from current mouse position to find possible intersections
   */
  private raycastLabels (
    x: number,
    y: number,
    camera: THREE.Camera,
    raycaster: THREE.Raycaster
  ): void {
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera)

    const shapes = this.getRaycastableShapes()
    const intersects = raycaster.intersectObjects(
      // Need to do this middle conversion because ThreeJS does not specify
      // as readonly, but this should be readonly for all other purposes
      shapes as unknown as THREE.Object3D[], false
    )

    if (intersects.length > 0) {
      const closestIntersect = intersects[0]
      this.highlight(closestIntersect)
    } else {
      this.highlight(null)
    }
  }
}
