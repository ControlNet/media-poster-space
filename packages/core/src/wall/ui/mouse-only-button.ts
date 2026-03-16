export function bindMouseOnlyButtonAction(
  button: HTMLButtonElement,
  onAction: () => void
): void {
  button.tabIndex = -1
  button.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse" || event.button !== 0) {
      return
    }

    onAction()
  })
  button.addEventListener("click", (event) => {
    event.preventDefault()
  })
}

export function bindMouseOnlyHover(
  element: HTMLElement,
  onEnter: () => void,
  onLeave: () => void
): void {
  element.addEventListener("pointerenter", (event) => {
    if (event.pointerType !== "mouse") {
      return
    }

    onEnter()
  })
  element.addEventListener("pointerleave", (event) => {
    if (event.pointerType !== "mouse") {
      return
    }

    onLeave()
  })
}
