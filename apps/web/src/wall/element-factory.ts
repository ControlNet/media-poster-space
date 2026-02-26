export interface ElementFactoryOptions {
  className?: string
  textContent?: string
  testId?: string
}

export type ElementFactory = <K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options?: ElementFactoryOptions
) => HTMLElementTagNameMap[K]
