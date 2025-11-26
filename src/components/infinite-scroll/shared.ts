import type { AnimateScrollOptions, RebalancedState, RebalanceStrategy, ViewModel, ViewModelId, ViewModelItem } from './types'

/**
 * Returns the anchor item, relative to which the new virtual list of items
 * will be built. In current implementation, anchor is closest to center of viewport.
 */
export function getAnchor(scroller: HTMLElement): HTMLElement | null {
    const items = getItemElements(scroller)
    const scrollCenter = getCenter(scroller)
    let closestItem: HTMLElement | null = null
    let minDistance = Number.POSITIVE_INFINITY

    for (const item of items) {
        const itemCenter = getCenter(item)
        const distance = Math.abs(itemCenter - scrollCenter)

        if (distance < minDistance) {
            minDistance = distance
            closestItem = item
        }
    }

    return closestItem
}

/**
 * Returns given elements’ internal ID
 */
export function getAnchorId(elem: HTMLElement): ViewModelId {
    return Number(elem.dataset.anchor)
}

/**
 * Returns a list of HTML elements representing the items
 */
export function getItemElements(container: HTMLElement) {
    return container.getElementsByClassName('infinite-scroll-item') as HTMLCollectionOf<HTMLElement>
}

/**
 * For debugging: returns list of rendered item IDs
 */
export function getRenderedItems(scroller: HTMLElement): string[] {
    return Array.from(getItemElements(scroller)).map(elem => elem.dataset.anchor || '')
}

/**
 * Returns horizontal center position of given element
 */
export function getCenter(elem: HTMLElement) {
    const rect = elem.getBoundingClientRect()
    return rect.left + rect.width / 2
}

/**
 * Creates initial view model
 */
export function createView<T>(items: T[]): ViewModel {
    let _id = 1
    return {
        items: items.map((_, index) => ({ id: _id++, index })),
        totalItems: items.length,
        _id
    }
}

/**
 * Rebalances given view model to contain current, previous and next items.
 * Scrolling in mobile is tricky (especially on iOS, where momentum scrolling is
 * implemented as internal animation, not as discrete scroll events), so we need to
 * rebuild the view model only when scroll is completely finished to ensure
 * correct scroll position.
 */
export function rebalanceItems(
    model: ViewModel,
    anchor: ViewModelId,
    strategy: RebalanceStrategy,
): RebalancedState {
    const { items, totalItems } = model

    // Anchor is currently visible item
    const anchorIx = items.findIndex(item => item.id === anchor)
    if (anchorIx === -1) {
        throw new Error('No anchor found')
    }

    const normalizeIndex = (ix: number) => ((ix % totalItems) + totalItems) % totalItems
    const anchorItem = model.items[anchorIx]!
    const leftItems: ViewModelItem[] = []
    const rightItems: ViewModelItem[] = []

    let itemsCount = 0
    if (strategy.type === 'by-count') {
        itemsCount = strategy.count
    } else if (strategy.type === 'by-size') {
        const baseSize = strategy.container.clientWidth
        const overscrollSize = baseSize * 1 // Maybe make it as option?
        itemsCount = Math.ceil((baseSize / 2 + overscrollSize) / strategy.size)
    }

    // Fill left side
    for (let i = 0; i < itemsCount; i++) {
        const item = items[anchorIx - 1 - i] || {
            id: model._id++,
            index: normalizeIndex(anchorItem.index - 1 - i),
        }

        leftItems.push(item)
    }

    leftItems.reverse()

    // Fill right side
    for (let i = 0; i < itemsCount; i++) {
        const item = items[anchorIx + i] || {
            id: model._id++,
            index: normalizeIndex(anchorItem.index + i),
        }
        rightItems.push(item)
    }

    return leftItems.concat(rightItems)
}

/**
 * Calculates scroll list item size
 */
export function getItemSize(container: HTMLElement) {
    const elems = getItemElements(container)
    // Get scroll item width. Since we may use margins/gaps for spacing,
    // use fast path to detect item size: just measure distance between left edge
    // of second element and left edge of scroller
    const firstElem = elems.item(0)
    const secondElem = elems.item(1)
    const containerRect = container.getBoundingClientRect()

    if (secondElem) {
        const itemRect = secondElem.getBoundingClientRect()
        return itemRect.left - containerRect.left + container.scrollLeft
    }

    if (firstElem) {
        const itemRect = firstElem.getBoundingClientRect()
        return itemRect.right - containerRect.left + container.scrollLeft
    }

    return 0
}


/**
 * Animated scroll
 * @returns A function to stop animation
 */
export function animateScroll(scroller: Element, options: AnimateScrollOptions): () => void {
    const { from = scroller.scrollLeft, to, duration, absolute } = options
    const delta = Math.round(to - from)
    const startPos = scroller.scrollLeft
    const startTime = Date.now()
    const easing = duration > 370 ? easeOutExpo : easeOutCubic
    let stopped = false
    let rafId: number
    let prevOffset = 0

    const stop = (cancel?: boolean) => {
        if (!stopped) {
            stopped = true
            cancelAnimationFrame(rafId)
            console.log('scroll animation stopped at', scroller.scrollLeft)
            options.callback?.(cancel)
        }
    }

    const loop = () => {
        if (stopped) {
            return
        }

        const curTime = Math.min(Date.now() - startTime, duration)
        const offset = delta * easing(curTime, 0, 1, duration)
        if (absolute) {
            scroller.scrollLeft = startPos + offset
        } else {
            const scrollChange = offset - prevOffset
            prevOffset = offset
            scroller.scrollLeft += scrollChange
        }

        if (curTime < duration) {
            rafId = requestAnimationFrame(loop)
        } else {
            stop()
        }
    }

    rafId = requestAnimationFrame(() => {
        scroller.scrollLeft = startPos
        if (delta) {
            loop()
        } else {
            stop()
        }
    });

    return stop
}

/**
 * Calls callback when all virtual scroll items are actually rendered in DOM.
 * Used to dirty fix for initial component render, where Qwik may delay actual
 * DOM flushing after view model is updated to fetch all dependencies.
 */
export function whenRendered(scroller: HTMLElement, viewModel: ViewModel, callback: () => void) {
    const observer = new MutationObserver(() => {
        const elementCount = getItemElements(scroller).length
        const modelCount = viewModel.items.length
        if (elementCount === modelCount) {
            observer.disconnect()
            callback()
        }
    })
    observer.observe(scroller, { childList: true, subtree: true })
}

export function updateScrollAnimationState(scroller: HTMLElement, hotZoneSize = 0) {
    const scrollRect = scroller.getBoundingClientRect()
    const center = getCenter(scroller)
    const hotZone1 = scrollRect.left + scrollRect.width * hotZoneSize
    const hotZone2 = scrollRect.left + scrollRect.width * (1 - hotZoneSize)
    const minHotZone = Math.min(hotZone1, hotZone2)
    const maxHotZone = Math.max(hotZone1, hotZone2)

    // We should check how close items are to center of viewport.
    // Create center lookup in one pass and then update styles
    // in second pass to avoid extra reflows
    const rectLookup = new Map<HTMLElement, number>()

    for (const elem of getItemElements(scroller)) {
        rectLookup.set(elem, getCenter(elem))
    }

    for (const [elem, rectCenter] of rectLookup) {
        // Provide 2 properties for convenience:
        // `fullPos` changes from 0 to 1 from start to the end of hotzone
        // `pos` changes from 0 to 1 from hot start to center of scroll, and
        //  from 1 to 0 from center to hot end
        let pos = 0
        let fullPos = 0
        const distanceFromCenter = Math.abs(rectCenter - center)

        if (hotZoneSize) {
            // Use hot zone: desktop implementation
            if (rectCenter > minHotZone && rectCenter < maxHotZone) {
                fullPos = (rectCenter - minHotZone) / (maxHotZone - minHotZone)

                if (rectCenter <= center) {
                    pos = (rectCenter - minHotZone) / (center - minHotZone)
                } else  {
                    pos = 1 - (rectCenter - center) / (maxHotZone - center)
                }
            }
        } else {
            // No hot zone: mobile implementation
            if (distanceFromCenter < scrollRect.width) {
                fullPos = pos = 1 - distanceFromCenter / scrollRect.width
            }
        }

        elem.style.setProperty('--pos', String(pos))
        elem.style.setProperty('--full-pos', String(fullPos))
    }
}

function easeOutCubic(t: number, b: number, c: number, d: number): number {
    return c * ((t = t / d - 1) * t * t + 1) + b
}

function easeOutExpo(t: number, b: number, c: number, d: number): number {
    return (t == d) ? b + c : c * 1.001 * (-Math.pow(2, -10 * t / d) + 1) + b
}
