/**
 * Returns `true` if the specified element has a focus ring
 */
export function isFocusVisible(elem: Element) {
    try {
        // Old browsers may not support this pseudo-class
        return elem?.matches(':focus-visible') || false
    } catch {
        return false
    }
}

/**
 * Returns the element that currently has the focus ring
 */
export function getFocusedElement(): HTMLElement | undefined {
    const elem = document.activeElement
    if (elem && elem !== document.body && isFocusVisible(elem)) {
        return elem as HTMLElement
    }
}

/**
 * Returns a list of focusable elements within the container
 */
export function getFocusableElements(context: Element): HTMLElement[] {
    return Array.from(context.querySelectorAll('a, button, [tabindex="0"], input:not([type=hidden])'));
}