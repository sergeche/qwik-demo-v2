import { $, component$, type QRL, useSignal, useTask$, useVisibleTask$, type JSX, useConstant } from '@qwik.dev/core'
import styles from './infinite-scroll.module.css'

type ViewModelId = number

interface ViewModelItem {
    /** Unique item id */
    id: ViewModelId
    /** Reference to original item index in item list */
    index: number
}

interface ViewModel {
    /** Items to render (previous, current, next) */
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

    /**
     * Set absolute scroll position instead of incremental delta.
     * Delta works better on desktop, while absolute is more precise on mobile.
     */
    absolute?: boolean

    /** Callback to run when animation is finished */
    callback?: (cancel?: boolean) => void
}

interface ScrollState {
    /** Prevent scroll event handling during programmatic scrolls */
    isScrolling: boolean
    /** Whether user is currently touching the scroller */
    isTouching: boolean
    /** Timeout for detecting scroll end */
    scrollEndTimeout?: number
    /** Handler to stop animated scroll */
    animatedScroll?: ((cancel?: boolean) => void) | null
}

export const InfiniteList = component$<InfiniteListProps<any>>(props => {
    const {
        items,
        render,
        maxAnimatedScrollSize = 400,
    } = props

    const scrollerRef = useSignal<HTMLDivElement>()
    const viewModel = useSignal(createView(items))
    /** A special object to synchronize scroll position */
    const syncBeacon = useSignal<SyncBeacon | null>(null)
    /** Anchor element: the one that closer to center */
    const anchor = useSignal<HTMLElement | null>(null)
    /** ID of currently active element */
    const activeId = useSignal<ViewModelId>(0)
    /** Internal scroller state */
    const scrollState = useConstant<ScrollState>({
        isScrolling: false,
        isTouching: false,
    })

    const rebalance = $((): SyncBeacon | null => {
        console.log('rebalance', viewModel.value.items)
        const scroller = scrollerRef.value!
        if (anchor.value) {
            const anchorId = getAnchorId(anchor.value)
            const rebalanced = rebalanceItems(viewModel.value, anchorId)
            console.log('rebalanced', rebalanced)
            const curItems = viewModel.value.items

            // Quick check if we need to rebuild model
            if (!rebalanced.every((item, i) => item.index === curItems[i]?.index)) {
                console.log('update view model')
                viewModel.value = {
                    ...viewModel.value,
                    items: rebalanced
                }
                // Disable scroll snapping during view model update to avoid
                // misaligned scroll in Safari iOS
                disableScrollSnapping(scroller)
            }

            return {
                id: anchorId,
                elem: anchor.value,
                rect: anchor.value.getBoundingClientRect(),
                scrollLeft: scroller.scrollLeft
            }
        }

        return null
    })

    const rebalanceWhenNeeded = $(async () => {
        const scroller = scrollerRef.value
        // TODO scroll snapping should be enabled. Check if anchor item
        // is center-snapped
        if (scroller && !scrollState.isScrolling && !scrollState.isTouching) {
            syncBeacon.value = await rebalance()
            if (syncBeacon.value) {
                activeId.value = syncBeacon.value.id
            }
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

        console.log('animated scroll options', options)

        // Cancel active animation, if any
        await stopAnimatedScroll()

        // Disable scroll snapping during animated scroll (won’t animate otherwise).
        disableScrollSnapping(scroller)

        const stop = animateScroll(scroller, {
            ...options,
            callback(cancel) {
                if (scrollState.animatedScroll === stop) {
                    console.log('animated scroll finished')
                    scrollState.animatedScroll = null
                    enableScrollSnapping(scroller)
                }
                options.callback?.(cancel)

                if (!cancel) {
                    scrollState.isScrolling = false
                    rebalanceWhenNeeded()
                }
            }
        })

        return scrollState.animatedScroll = stop
    })

    const activateItemWithOffset = $(async (offset: number) => {
        console.log('activate item with offset', offset)
        if (scrollState.animatedScroll || scrollState.isScrolling) {
            console.log('skip activate due to active scroll')
            return
        }

        const { items } = viewModel.value
        const ix = items.findIndex(item => item.id === activeId.value)
        if (ix === -1) {
            console.warn('No active item found', items, activeId.value)
            return
        }

        const nextItem = items[ix + offset]
        if (!nextItem) {
            // The only reason how user gets to the end of items list is due to
            // stress-testing by clicking really fast on arrow controls.
            // In this case, nobody actually cares about final result so we can
            // safely skip update: there’s must active scroll animation which will
            // eventually rebalance view mode
            console.log('skip activate due to end of items list')
            return
        }

        await stopAnimatedScroll()
        console.log('activate item', nextItem.id)
        activeId.value = nextItem.id
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

        // For mobile, we should check how close items are to center of viewport
        // Create center lookup in one pass and then update styles
        // in second pass to avoid extra reflows
        const rectLookup = new Map<HTMLElement, number>()

        for (const elem of getItemElements(scroller)) {
            rectLookup.set(elem, getCenter(elem))
        }

        for (const [elem, rectCenter] of rectLookup) {
            let pos = 0

            const distanceFromCenter = Math.abs(rectCenter - center)
            if (distanceFromCenter >= scrollRect.width) {
                // Completely out of view
                pos = 0
            } else {
                // Within view
                pos = 1 - distanceFromCenter / scrollRect.width
            }

            elem.style.setProperty('--pos', String(pos))
            elem.style.setProperty('--full-pos', String(pos))
        }
    })

    const isAnchor = (item: any) => {
        if (anchor.value) {
            const anchorId = getAnchorId(anchor.value)
            const modelItem = viewModel.value.items.find(item => item.id === anchorId)
            if (modelItem) {
                return items.indexOf(item) === modelItem.index
            }
        }

        return false
    }

    useTask$(({ track }) => {
        track(() => items)
        viewModel.value = createView(items)
    })

    // Scroll to active item when it changes (mainly due to arrow control clicks)
    useTask$(({ track }) => {
        track(activeId)
        const scroller = scrollerRef.value

        if (!scroller || scrollState.animatedScroll) {
            return
        }

        const activeElem = Array.from(getItemElements(scroller)).find(elem => getAnchorId(elem) === activeId.value)
        if (activeElem) {
            const viewportCenter = getCenter(scroller)
            const elemCenter = getCenter(activeElem)
            const delta = elemCenter - viewportCenter
            if (delta) {
                console.log('scroll to active item', { delta })
                startAnimatedScroll({
                    to: scroller.scrollLeft + delta,
                    duration: 350,
                    absolute: true,
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
            // Assuming that rebalance and scroll sync happens when scroll
            // is completely stopped
            const { elem, rect } = syncBeacon.value
            const renderedElements = Array.from(getItemElements(scroller)).map(elem => getAnchorId(elem))
            console.log('sync beacon updated', scroller.scrollLeft, renderedElements)
            // Update scroll on rAF, this reduces flickering in Safari
            requestAnimationFrame(() => {
                const curRect = elem.getBoundingClientRect()
                const delta = curRect.left - rect.left
                console.log('sync scroll position', { delta })
                if (delta) {
                    console.log('update scroll position', { delta })
                    scroller.scrollLeft += delta
                }
                enableScrollSnapping(scroller)
            })
        } else {
            // Initial render, setup view model
            anchor.value = getAnchor(scroller)
            const sync = await rebalance()
            whenRendered(scroller, () => {
                if (sync) {
                    const anchorCenter = getCenter(sync.elem)
                    const scrollCenter = getCenter(scroller)
                    const delta = anchorCenter - scrollCenter
                    if (delta) {
                        console.log('adjust scroll', delta)
                        scroller.scrollLeft += delta
                    }
                    activeId.value = sync.id
                }
            })

            // NB: Qwik delegates events to root, we should handle it on element
            scroller.addEventListener('scroll', async () => {
                clearTimeout(scrollState.scrollEndTimeout)
                scrollState.isScrolling = true
                scrollState.scrollEndTimeout = window.setTimeout(() => {
                    const renderedElements = Array.from(getItemElements(scroller)).map(elem => getAnchorId(elem))
                    console.log('scroll end', scroller.scrollLeft, renderedElements)

                    scrollState.isScrolling = false
                    rebalanceWhenNeeded()
                }, 200)

                // Always update anchor during scroll
                anchor.value = getAnchor(scroller)
                updateElements()
            })

            scroller.addEventListener('touchstart', () => {
                scrollState.isTouching = true
            })
            scroller.addEventListener('touchend', () => {
                scrollState.isTouching = false
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

            <div class={styles.indicators}>
                {items.map((item, ix) => <div class={[styles.indicator, isAnchor(item) && styles.indicatorActive]} key={ix}></div>)}
            </div>
        </div>
    </div>
})

/**
 * Returns the anchor item, relative to which the new virtual list of items
 * will be built. In current implementation, anchor is closest to center of viewport.
 */
function getAnchor(scroller: HTMLElement): HTMLElement | null {
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
 * Creates initial view model
 */
function createView<T>(items: T[]): ViewModel {
    let _id = 1
    return {
        items: [{ id: _id++, index: 0 }],
        totalItems: items.length,
        _id,
    }
}

/**
 * Rebalances given view model to contain current, previous and next items.
 * Scrolling in mobile is tricky (especially on iOS, where momentum scrolling is
 * implemented as internal animation, not as discrete scroll events), so we need to
 * rebuild the view model only when scroll is completely finished to ensure
 * correct scroll position.
 */
function rebalanceItems(
    model: ViewModel,
    anchor: ViewModelId,
): RebalancedState {
    const { items, totalItems } = model

    // Anchor is currently visible item
    const anchorIx = items.findIndex(item => item.id === anchor)
    if (anchorIx === -1) {
        throw new Error('No anchor found')
    }

    const normalizeIndex = (ix: number) => (ix + totalItems) % totalItems

    const currentItem = model.items[anchorIx]!
    const prevItem = model.items[anchorIx - 1] || {
        id: model._id++,
        index: normalizeIndex(currentItem.index - 1),
    }

    const nextItem = items[anchorIx + 1] || {
        id: model._id++,
        index: normalizeIndex(currentItem.index + 1),
    }

    return [prevItem, currentItem, nextItem]
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
    const { from = scroller.scrollLeft, to, duration, absolute } = options
    const delta = Math.round(to - from)
    const startPos = scroller.scrollLeft
    const startTime = Date.now()
    const easing = duration > 370 ? easeOutExpo : easeOutCubic
    let stopped = false
    let rafId: number
    let prevOffset = 0

    console.log('animate scroll', { from, to, delta, duration })

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

function disableScrollSnapping(scroller: HTMLElement) {
    scroller.classList.add(styles._disable_snapping)
}

function enableScrollSnapping(scroller: HTMLElement) {
    scroller.classList.remove(styles._disable_snapping)
}

function easeOutCubic(t: number, b: number, c: number, d: number): number {
    return c * ((t = t / d - 1) * t * t + 1) + b
}

function easeOutExpo(t: number, b: number, c: number, d: number): number {
    return (t == d) ? b + c : c * 1.001 * (-Math.pow(2, -10 * t / d) + 1) + b
}