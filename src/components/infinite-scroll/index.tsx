import { $, component$, useConstant, useSignal, useTask$, useVisibleTask$ } from '@qwik.dev/core'
import styles from './infinite-scroll.module.css'

export interface Item {
    id: number
    title: string
    price: string
    image: string
    bgImage?: string
}

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

interface ScrollListItemProps {
    item: Item
    id: ViewModelId
    active?: boolean
}

type RebalancedState = ViewModelItem[]

interface Props {
    items: Item[];
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

export interface AnimateScrollOptions {
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

export const InfiniteScroll = component$((props: Props) => {
    const {
        items,
        edgeSize = 200,
        autocenterDelay = 500
    } = props
    const scrollerRef = useSignal<HTMLDivElement>()
    const viewModel = useSignal(createView(items))
    const itemSize = useSignal(0)
    const syncBeacon = useSignal<SyncBeacon | null>(null)
    /** ID of currently active element */
    const activeId = useSignal<ViewModelId>(0)
    const scrollState = useConstant<ScrollState>({
        skip: 0,
        autocenterTimeout: 0,
    })

    const rebalance = $((): SyncBeacon | null => {
        const scroller = scrollerRef.value!
        console.log('run rebalance', { scrollLeft: scroller.scrollLeft, scrollWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth })
        const anchorElem = getAnchor(scroller)
        if (anchorElem) {
            if (!itemSize.value) {
                itemSize.value = getItemSize(scroller)
            }

            const anchorId = getAnchorId(anchorElem)
            const rebalanced = rebalanceItems(scroller, viewModel.value, anchorId, itemSize.value)

            console.log('Rebalanced', anchorId, rebalanced)

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

        options = { ...options }
        const { maxAnimatedScrollSize = 400 } = props

        if (maxAnimatedScrollSize) {
            // Clamp animation travel distance
            const { from = scroller.scrollLeft, to } = options
            let delta = to - from
            if (Math.abs(delta) > maxAnimatedScrollSize) {
                delta = maxAnimatedScrollSize * (delta < 0 ? -1 : 1)
                options.from = to - delta
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
            console.warn('No active element found')
            return
        }

        console.log('Activate item: found %d of %d', ix, items.length)

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
        console.log('activate item', activeId.value)
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

        console.log('run autocenter')

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

        const { hotZoneSize = 0.4 } = props
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
            console.log('Center to', activeId.value)
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
            const { elem, rect, scrollLeft } = syncBeacon.value
            // Update scroll on rAF, this reduces flickering in Safari
            requestAnimationFrame(() => {
                const curRect = elem.getBoundingClientRect()
                const delta = curRect.left - rect.left
                const scrollDelta = scroller.scrollLeft - scrollLeft
                // console.log('Adjust on rebalance', { scrollLeft: scroller.scrollLeft, delta })
                console.log('Apply rebalance delta', { scrollLeft: scroller.scrollLeft, delta, scrollDelta })
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
                return <InfiniteScrollItem item={items[index]} id={id} active={activeId.value === id} key={id}/>
            })}
        </div>
    </div>
})

export const InfiniteScrollItem = component$(({ item, id, active }: ScrollListItemProps) => {
    return <div class={[styles.item, active ? styles.itemActive : '']} data-active={active} data-anchor={id}>
        <div class={styles.product}>
            <a href={`/product/${item.id}`}>
                <div class={styles.productBg} style={item.bgImage ? `background-image: url('${item.bgImage}');` : undefined}>
                    <h3>{ item.title }</h3>
                </div>
                <div class={styles.productImage}>
                    <img src={item.image} width={100} height={100} alt="" />
                </div>
            </a>
            <div class={styles.productInfo}>
                <h4>Akcijska cena:</h4>
                <div class={styles.productPrice}>{item.price}</div>
                <div class={styles.productPrevPrice}>Osnovna cena: 1.299,00 RSD</div>
                <div class={styles.productComment}>Akcija važi od 28. jula do 4. avgusta.</div>
                <button>Dodaj u korpu</button>
            </div>
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

function createView(items: Item[]): ViewModel {
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

    console.log({
        leftItems: leftItems.map(item => `${item.id}:${item.index}`),
        rightItems: rightItems.map(item => `${item.id}:${item.index}`),
    })

    return leftItems.concat(rightItems)
}

export function getCenter(elem: HTMLElement) {
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
        console.log('animate scroll')
        scroller.scrollLeft += scrollChange

        if (curTime < duration) {
            rafId = requestAnimationFrame(loop)
        } else {
            stop()
        }
    }

    console.log('begin animate', delta)

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

export function easeOutCubic(t: number, b: number, c: number, d: number): number {
    return c * ((t = t / d - 1) * t * t + 1) + b
}

export function easeOutExpo(t: number, b: number, c: number, d: number): number {
    return (t == d) ? b + c : c * 1.001 * (-Math.pow(2, -10 * t / d) + 1) + b
}