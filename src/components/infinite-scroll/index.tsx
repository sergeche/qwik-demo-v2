import { $, component$, QRL, useConstant, useSignal, useTask$, useVisibleTask$, type JSX } from '@qwik.dev/core'
import styles from './infinite-scroll.module.css'

type ViewModelId = number

interface ViewModelItem {
    /** Unique item id */
    id: ViewModelId
    /** Reference to original item index in item list */
    index: number
}

interface ViewModel {
    /** Items to render in infinite scroll */
    items: ViewModelItem[]
    /** Total amount of distinct items to render */
    totalItems: number
    /** Internal ID counter */
    _id: number
}

interface SyncBeacon {
    id: ViewModelId
    elem: HTMLElement
    rect: DOMRect
    scrollLeft: number
}

type RebalancedState = ViewModelItem[]

export type InfiniteListItemRenderer<T> = (item: T, active: boolean, internalId: ViewModelId) => JSX.Element

export interface InfiniteListProps<T> {
    /** List of items to render */
    items: T[]

    /** Function to render individual item */
    render: QRL<InfiniteListItemRenderer<T>>

    /**
     * Size of the edge in pixels, relative to which we will determine
     * the need to update the virtual list
     */
    edgeSize?: number

    /** Delay before autocentering after scroll */
    autocenterDelay?: number

    /** Percentage of scroll area where animation should begin */
    hotZoneSize?: number

    /**
     * Max length of animated scroll distance. Use this properly to limit the
     * distance animation should travel to make animation snappy and smooth
     */
    maxAnimatedScrollSize?: number
}

interface AnimateScrollOptions {
    /** Initial scroll position to start */
    from?: number

    /** Target scroll position */
    to: number

    /** Animation duration, in ms */
    duration: number

    /** Callback to run when animation is finished */
    callback?: (cancel?: boolean) => void
}

interface ScrollState {
    /** Amount of scroll cycles to skip for better virtual scroll handling */
    skip: number

    /** Timer ID to trigger autocenter after scroll stops */
    autocenterTimeout?: number

    /** Handler to stop animated scroll */
    animatedScroll?: ((cancel?: boolean) => void) | null
}

export const InfiniteScroll = component$<InfiniteListProps<any>>(props => {
    const {
        items,
        render,
        edgeSize = 200,
        autocenterDelay = 500,
        maxAnimatedScrollSize = 400,
        hotZoneSize = 0.4,
    } = props
    const scrollerRef = useSignal<HTMLDivElement>()
    const viewModel = useSignal(createView(items))
    /** Item width  */
    const itemSize = useSignal(0)
    /** A special object to synchronize scroll position */
    const syncBeacon = useSignal<SyncBeacon | null>(null)
    /** ID of currently active element */
    const activeId = useSignal<ViewModelId>(0)
    /** Internal scroller state */
    const scrollState = useConstant<ScrollState>({
        skip: 0,
        autocenterTimeout: 0,
    })

    const rebalance = $((): SyncBeacon | null => {
        const scroller = scrollerRef.value!
        const anchorElem = getAnchor(scroller)
        if (anchorElem) {
            if (!itemSize.value) {
                itemSize.value = getItemSize(scroller)
            }

            const anchorId = getAnchorId(anchorElem)
            const rebalanced = rebalanceItems(scroller, viewModel.value, anchorId, itemSize.value)

            viewModel.value = {
                ...viewModel.value,
                items: rebalanced
            }

            return {
                id: anchorId,
                elem: anchorElem,
                rect: anchorElem.getBoundingClientRect(),
                scrollLeft: scroller.scrollLeft
            }
        }

        return null
    })

    const rebalanceWhenNeeded = $(async () => {
        const scroller = scrollerRef.value
        if (scroller && !scrollState.animatedScroll && atViewportEdge(scroller, edgeSize)) {
            syncBeacon.value = await rebalance()
        }
    })

    const stopAnimatedScroll = $(() => {
        const stop = scrollState.animatedScroll
        if (stop) {
            scrollState.animatedScroll = null
            stop(true)
        }
    })

    const startAnimatedScroll = $(async (options: AnimateScrollOptions) => {
        const scroller = scrollerRef.value
        if (!scroller) {
            return
        }

        if (maxAnimatedScrollSize) {
            // Clamp animation travel distance
            const { from = scroller.scrollLeft, to } = options
            let delta = to - from
            if (Math.abs(delta) > maxAnimatedScrollSize) {
                delta = maxAnimatedScrollSize * (delta < 0 ? -1 : 1)
                options = {
                    ...options,
                    from: to - delta
                }
            }
        }

        // Cancel active animation, if any
        await stopAnimatedScroll()

        const stop = animateScroll(scroller, {
            ...options,
            callback(cancel) {
                if (scrollState.animatedScroll === stop) {
                    scrollState.animatedScroll = null
                }
                options.callback?.(cancel)

                // By default, rebalancing is locked during animated scroll since
                // Qwik may not apply DOM changes on next task after view model update.
                rebalanceWhenNeeded()
            }
        })

        return scrollState.animatedScroll = stop
    })

    const activateItemWithOffset = $(async (offset: number) => {
        if (scrollState.animatedScroll) {
            return
        }

        const { items } = viewModel.value
        const ix = items.findIndex(item => item.id === activeId.value)
        if (ix === -1) {
            return
        }

        const nextItem = items[ix + offset]
        if (!nextItem) {
            // The only reason how user gets to the end of items list is due to
            // stress-testing by clicking really fast on arrow controls.
            // In this case, nobody actually cares about final result so we can
            // safely skip update: there’s must active scroll animation which will
            // eventually rebalance view mode
            return
        }

        await stopAnimatedScroll()
        activeId.value = nextItem.id
    })

    /**
     * Automatically centers closest item of scroller.
     * NB: don’t use CSS scroll-snap since it will break infinite scroll behavior
     */
    const autocenter = $(() => {
        const scroller = scrollerRef.value

        if (!scroller || scrollState.animatedScroll) {
            return
        }

        const viewportCenter = getCenter(scroller)
        let closest: HTMLElement | null = null
        let closestDistance = Number.POSITIVE_INFINITY

        for (const elem of getItemElements(scroller)) {
            const center = getCenter(elem)
            const distance = center - viewportCenter
            if (Math.abs(distance) < Math.abs(closestDistance)) {
                closestDistance = distance
                closest = elem
            }
        }

        if (closest) {
            activeId.value = getAnchorId(closest)
            if (Math.abs(closestDistance) > 1) {
                startAnimatedScroll({
                    to: scroller.scrollLeft + closestDistance,
                    duration: 300,
                })
            }
        }
    })

    /**
     * Calls callback when all virtual scroll items are actually rendered in DOM.
     * Used to dirty fix for initial component render, where Qwik may delay actual
     * DOM flushing after view model is updated to fetch all dependencies.
     */
    const whenRendered = $((scroller: HTMLElement, callback: () => void) => {
        const observer = new MutationObserver(() => {
            const elementCount = getItemElements(scroller).length
            const modelCount = viewModel.value.items.length
            if (elementCount === modelCount) {
                observer.disconnect()
                callback()
            }
        })
        observer.observe(scroller, { childList: true, subtree: true })
    })

    const updateElements = $(() => {
        const scroller = scrollerRef.value
        if (!scroller) {
            return
        }

        const scrollRect = scroller.getBoundingClientRect()
        const center = getCenter(scroller)
        const hotZone1 = scrollRect.left + scrollRect.width * hotZoneSize
        const hotZone2 = scrollRect.left + scrollRect.width * (1 - hotZoneSize)
        const minHotZone = Math.min(hotZone1, hotZone2)
        const maxHotZone = Math.max(hotZone1, hotZone2)

        // Create bounding rect lookup in one pass and then update styles
        // in second pass to avoid extra reflows
        const rectLookup = new Map<HTMLElement, DOMRect>()

        for (const elem of getItemElements(scroller)) {
            rectLookup.set(elem, elem.getBoundingClientRect())
        }

        for (const [elem, rect] of rectLookup) {
            // Provide 2 properties for convenience:
            // `fullPos` changes from 0 to 1 from start to the end of hotzone
            // `pos` changes from 0 to 1 from hot start to center of scroll, and
            //  from 1 to 0 from center to hot end
            let pos = 0
            let fullPos = 0
            const rectCenter = rect.left + rect.width / 2

            if (rectCenter > minHotZone && rectCenter < maxHotZone) {
                fullPos = (rectCenter - minHotZone) / (maxHotZone - minHotZone)

                if (rectCenter <= center) {
                    pos = (rectCenter - minHotZone) / (center - minHotZone)
                } else  {
                    pos = 1 - (rectCenter - center) / (maxHotZone - center)
                }
            }

            elem.style.setProperty('--pos', String(pos))
            elem.style.setProperty('--full-pos', String(fullPos))
        }
    })

    useTask$(({ track }) => {
        track(() => items)
        viewModel.value = createView(items)
    })

    useTask$(({ track }) => {
        track(activeId)
        const scroller = scrollerRef.value

        if (scrollState.animatedScroll || !scroller) {
            return
        }

        const activeElem = Array.from(getItemElements(scroller)).find(elem => getAnchorId(elem) === activeId.value)
        if (activeElem) {
            const viewportCenter = getCenter(scroller)
            const elemCenter = getCenter(activeElem)
            const delta = elemCenter - viewportCenter
            if (delta) {
                startAnimatedScroll({
                    to: scroller.scrollLeft + delta,
                    duration: 300
                })
            }
        }
    })

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(async ({ track }) => {
        track(syncBeacon)

        const scroller = scrollerRef.value
        if (!scroller) {
            return
        }

        if (syncBeacon.value) {
            const { elem, rect } = syncBeacon.value
            // Update scroll on rAF, this reduces flickering in Safari
            requestAnimationFrame(() => {
                const curRect = elem.getBoundingClientRect()
                const delta = curRect.left - rect.left
                scroller.scrollLeft += delta
            })
            scrollState.skip = 3
        } else {
            // Initial render, setup view model
            const sync = await rebalance()
            whenRendered(scroller, () => {
                if (sync) {
                    const anchorCenter = getCenter(sync.elem)
                    const scrollCenter = getCenter(scroller)
                    const delta = anchorCenter - scrollCenter
                    if (delta) {
                        scroller.scrollLeft += delta
                    }
                    activeId.value = sync.id
                }
            })

            // NB: Qwik delegates events to root, we should handle it on element
            scroller.addEventListener('scroll', async () => {

                clearTimeout(scrollState.autocenterTimeout)
                scrollState.autocenterTimeout = window.setTimeout(() => {
                    autocenter()
                }, autocenterDelay)

                requestAnimationFrame(updateElements)

                if (scrollState.skip > 0) {
                    // In Safari, it seems that scroll event is scheduled
                    // right before we adjust scrollLeft on rebalance, which
                    // triggers new rebalance with old scroll position but new
                    // view model. This leads to jagged scrolling experience
                    // and invalid list of rendered items. To avoid this,
                    // we skip first scroll event right after rebalance.
                    scrollState.skip--
                    return
                }

                rebalanceWhenNeeded()
            })
        }
    })

    return <div class={styles.container}>
        <button class={[styles.control, styles.controlLeft]} onClick$={() => activateItemWithOffset(-1)}>←</button>
        <button class={[styles.control, styles.controlRight]} onClick$={() => activateItemWithOffset(1)}>→</button>
        <div class={styles.scroller} ref={scrollerRef}>
            {viewModel.value.items.map(({ id, index }) => {
                const active = activeId.value === id
                return <div class={[styles.item, active ? styles.itemActive : '']} data-active={active} data-anchor={id} key={id}>
                    {render(items[index], active, id)}
                </div>
            })}
        </div>
    </div>
})

/**
 * Returns the anchor item, relative to which the new
 * virtual list of items will be built
 */
function getAnchor(scroller: HTMLElement): HTMLElement | undefined {
    const scrollRect = scroller.getBoundingClientRect()
    const items = getItemElements(scroller)

    // Anchor element is a first visible (even partially) element in viewport
    for (let i = 0; i < items.length; i++) {
        const rect = items[i].getBoundingClientRect()
        if (rect.right > scrollRect.left) {
            return items[i] as HTMLElement
        }
    }
}

function getAnchorId(elem: HTMLElement): ViewModelId {
    return Number(elem.dataset.anchor)
}

/**
 * Returns a list of HTML elements representing the items
 */
function getItemElements(container: HTMLElement) {
    return container.getElementsByClassName(styles.item) as HTMLCollectionOf<HTMLElement>
}

/**
 * Returns true if scroll is at viewport edge
 */
function atViewportEdge(scroller: HTMLElement, edgeSize: number): boolean {
    const { scrollLeft, scrollWidth, clientWidth } = scroller
    return scrollLeft < edgeSize
        || scrollWidth - clientWidth - scrollLeft < edgeSize
}

/**
 * Calculates scroll list item size
 */
function getItemSize(container: HTMLElement) {
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

function createView<T>(items: T[]): ViewModel {
    let _id = 1
    return {
        items: items.map((_, index) => ({ id: _id++, index })),
        totalItems: items.length,
        _id
    }
}

/**
 * Rebalances given view model to fill scroll area large enough for infinite scroll.
 * Returns updated view items list and scroll delta needed to match current viewport
 */
function rebalanceItems(
    container: HTMLElement,
    model: ViewModel,
    anchor: ViewModelId,
    itemSize: number
): RebalancedState {
    const baseSize = container.clientWidth
    const overscrollSize = baseSize * 1 // Maybe make it as option?
    const { items, totalItems } = model

    // Anchor is a leftmost visible item
    const anchorIx = items.findIndex(item => item.id === anchor)
    if (anchorIx === -1) {
        throw new Error('No anchor found')
    }
    const anchorItem = model.items[anchorIx]!
    const leftItemsCount = Math.ceil(overscrollSize / itemSize)
    const rightItemsCount = Math.ceil((baseSize + overscrollSize) / itemSize)
    const leftItems: ViewModelItem[] = []
    const rightItems: ViewModelItem[] = []

    // Fill left side
    for (let i = 0; i < leftItemsCount; i++) {
        let item = items[anchorIx - 1 - i]
        if (!item) {
            const originalItem = (anchorItem.index - 1 - i) % totalItems
            item = {
                id: model._id++,
                index: (originalItem + totalItems) % totalItems,
            }
        }
        leftItems.push(item)
    }

    leftItems.reverse()

    // Fill right side
    for (let i = 0; i < rightItemsCount; i++) {
        const item = items[anchorIx + i] || {
            id: model._id++,
            index: (anchorItem.index + i) % totalItems,
        }
        rightItems.push(item)
    }

    return leftItems.concat(rightItems)
}

function getCenter(elem: HTMLElement) {
    const rect = elem.getBoundingClientRect()
    return rect.left + rect.width / 2
}

/**
 * Animated scroll
 * @returns A function to stop animation
 */
function animateScroll(scroller: Element, options: AnimateScrollOptions): () => void {
    const { from = scroller.scrollLeft, to, duration } = options
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
            options.callback?.(cancel)
        }
    }

    const loop = () => {
        if (stopped) {
            return
        }

        const curTime = Math.min(Date.now() - startTime, duration)
        const offset = delta * easing(curTime, 0, 1, duration)
        const scrollChange = offset - prevOffset
        prevOffset = offset
        scroller.scrollLeft += scrollChange

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

function easeOutCubic(t: number, b: number, c: number, d: number): number {
    return c * ((t = t / d - 1) * t * t + 1) + b
}

function easeOutExpo(t: number, b: number, c: number, d: number): number {
    return (t == d) ? b + c : c * 1.001 * (-Math.pow(2, -10 * t / d) + 1) + b
}