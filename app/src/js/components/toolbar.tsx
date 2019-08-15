import Divider from '@material-ui/core/Divider'
import List from '@material-ui/core/List/List'
import ListItem from '@material-ui/core/ListItem'
import _ from 'lodash'
import React from 'react'
import { changeCurrentAttributes, changeLabelProps, deleteLabel } from '../action/common'
import { addLabelTag } from '../action/tag'
import { renderButtons, renderTemplate } from '../common/label'
import Session from '../common/session'
import { Attribute } from '../functional/types'
import { Component } from './component'
import { makeButton } from './general_button'
import { Category } from './toolbar_category'

/**
 * callback function for delete label button
 */
function onDeleteLabel () {
  const select = Session.getState().user.select
  if (select.label >= 0) {
    Session.dispatch(deleteLabel(select.item, select.label))
  }
}

/** This is the interface of props passed to ToolBar */
interface Props {
  /** categories of ToolBar */
  categories: string[] | null
  /** attributes of ToolBar */
  attributes: Attribute[]
  /** itemType of ToolBar 'video' | 'image' */
  itemType: string
  /** labelType of ToolBar 'box2d' | 'segmentation' | 'lane' */
  labelType: string
}

/**
 * This is ToolBar component that displays
 * all the attributes and categories for the 2D bounding box labeling tool
 */
export class ToolBar extends Component<Props> {
  constructor (props: Readonly<Props>) {
    super(props)
    this.handleToggle = this.handleToggle.bind(this)
    this.keyDownHandler = this.keyDownHandler.bind(this)
    this.handleAttributeToggle = this.handleAttributeToggle.bind(this)
  }

  /**
   * handles keyDown Events
   * @param {keyboardEvent} e
   */
  public keyDownHandler (e: KeyboardEvent) {
    if (e.key === 'Backspace') {
      const select = Session.getState().user.select
      if (select.label >= 0) {
        Session.dispatch(deleteLabel(select.item, select.label))
      }
    }
  }

  /**
   * Add keyDown Event Listener
   */
  public componentDidMount () {
    document.addEventListener('keydown', this.keyDownHandler)
  }

  /**
   * Remove keyDown Event Listener
   */
  public componentWillUnmount () {
    document.removeEventListener('keydown', this.keyDownHandler)
  }

  /**
   * ToolBar render function
   * @return component
   */
  public render () {
    const { categories, attributes, itemType, labelType } = this.props
    // FIXME: multiple option support
    const currentAttributes = Session.getState().user.select.attributes
    return (
      <div>
        {categories !== null ? (
          <ListItem style={{ textAlign: 'center' }}>
            <Category categories={categories} headerText={'Label Category'} />
          </ListItem>
        ) : null}
        <Divider variant='middle' />
        <List>
          {attributes.map((element: Attribute, index: number) =>
            renderTemplate(
              element.toolType,
              this.handleToggle,
              this.handleAttributeToggle,
              element.name,
              element.values,
              currentAttributes ? (
                Object.keys(currentAttributes).indexOf(String(index)) >= 0 ?
                  currentAttributes[index][0]
                  : 0)
              : 0,
              this.getAlignmentIndex(element.name)
            )
          )}
        </List>
        <div>
          <div>{makeButton('Delete', onDeleteLabel)}</div>
          {renderButtons(itemType, labelType)}
        </div>
      </div>
    )
  }

  /**
   * handles tag attribute toggle, dispatching the addLabelTag action
   * @param {string} alignment
   */
  private handleAttributeToggle (toggleName: string, alignment: string) {
    const state = Session.getState()
    const allAttributes = state.task.config.attributes
    const attributeIndex = this.getAttributeIndex(allAttributes, toggleName)
    if (attributeIndex === -1) {
      return
    }
    const currentAttribute = allAttributes[attributeIndex]
    const selectedIndex = currentAttribute.values.indexOf(alignment)
    Session.dispatch(addLabelTag(attributeIndex, selectedIndex))
  }
  /**
   * This function updates the checked list of switch buttons.
   * @param {string} switchName
   */
  private handleToggle = (switchName: string) => () => {
    const state = Session.getState()
    const allAttributes = state.task.config.attributes
    let toggleIndex = -1
    for (let i = 0; i < allAttributes.length; i++) {
      if (allAttributes[i].name === switchName) {
        toggleIndex = i
      }
    }
    if (toggleIndex > -1) {
      const currentAttributes = state.task.items[state.user.select.item].labels[
        state.user.select.label].attributes
      const attributes: {[key: number]: number[]} = {}
      for (const keyStr of Object.keys(currentAttributes)) {
        const key = Number(keyStr)
        attributes[key] = currentAttributes[key]
      }
      if (Object.keys(attributes).indexOf(String(toggleIndex)) >= 0) {
        delete attributes[toggleIndex]
      } else {
        attributes[toggleIndex] = [1]
      }
      Session.dispatch(changeLabelProps(state.user.select.item,
        state.user.select.label, { attributes }))
      Session.dispatch(changeCurrentAttributes(attributes))
      this.forceUpdate()
    }
  }

  /**
   * helper function to get attribute index with respect to the config
   * attributes
   * @param allAttributes
   * @param name
   */
  private getAttributeIndex (
    allAttributes: Attribute[],
    toggleName: string
  ): number {
    let attributeIndex = -1
    for (let i = 0; i < allAttributes.length; i++) {
      if (allAttributes[i].name === toggleName) {
        attributeIndex = i
      }
    }
    return attributeIndex
  }
  /**
   * helper function to get attribute index with respect to the label's
   * attributes
   */
  private getAlignmentIndex (name: string): number {
    const state = Session.getState()
    const item = state.task.items[state.user.select.item]
    const labelId = Number(_.findKey(item.labels))
    if (isNaN(labelId)) {
      return 0
    }
    const attributes = item.labels[labelId].attributes
    const attributeIndex = this.getAttributeIndex(
      state.task.config.attributes,
      name
    )
    if (attributeIndex < 0) {
      return 0
    }
    if (attributes[attributeIndex]) {
      return attributes[attributeIndex][0]
    } else {
      return 0
    }
  }
}
