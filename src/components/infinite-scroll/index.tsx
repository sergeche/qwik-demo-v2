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
    elem: HTMLElement
    rect: DOMRect
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
    const scrollState = useConstant({
        skip: 0,
        autocenterTimeout: 0
    })

    const getRendered = $((): string[] => {
        const scroller = scrollerRef.value
        if (scroller) {
            return Array.from(getItemElements(scroller)).map(el => el.dataset.anchor || '')
        }

        return []
    })

    const rebalance = $(async () => {
        const scroller = scrollerRef.value!
        console.log('run rebalance', { scrollLeft: scroller.scrollLeft, scrollWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth })
        const anchorElem = getAnchor(scroller)
        if (anchorElem) {
            if (!itemSize.value) {
                itemSize.value = getItemSize(scroller)
            }

            const anchorId = Number(anchorElem.dataset.anchor)
            const rebalanced = rebalanceItems(scroller, viewModel.value, anchorId, itemSize.value)

            console.log('Rebalanced', anchorId, rebalanced)

            viewModel.value = {
                ...viewModel.value,
                items: rebalanced
            }

            syncBeacon.value = {
                elem: anchorElem,
                rect: anchorElem.getBoundingClientRect()
            }

            console.log('before sync', await getRendered())
        }
    })

    /**
     * Automatically centers closest item of scroller.
     * NB: don’t use CSS scroll-snap since it will break infinite scroll behavior
     */
    const autocenter = $(() => {
        console.log('call autocenter')
        const scroller = scrollerRef.value
        const getCenter = (elem: HTMLElement) => {
            const rect = elem.getBoundingClientRect()
            return rect.left + rect.width / 2
        }
        if (scroller) {
            const viewportCenter = getCenter(scroller)
            let closest: HTMLElement | null = null
            let closestDistance = Number.POSITIVE_INFINITY

            for (const elem of getItemElements(scroller)) {
                const center = getCenter(elem)
                const distance = Math.abs(viewportCenter - center)
                if (distance < closestDistance) {
                    closestDistance = distance
                    closest = elem
                }
            }

            if (closest && closestDistance > 0) {
                console.log('closest elem', closestDistance, closest)
                closest.scrollIntoView({
                    behavior: 'smooth',
                    inline: 'center'
                })
            }
        } else {
            console.log('No scroller?')
        }
    })

    const updateElements = $(() => {
        const scroller = scrollerRef.value
        if (!scroller) {
            return
        }

        const { hotZoneSize = 0.4 } = props
        const scrollRect = scroller.getBoundingClientRect()
        const width = scrollRect.width
        const center = scrollRect.left + width / 2
        const hotZone1 = scrollRect.left + width * hotZoneSize
        const hotZone2 = scrollRect.left + width * (1 - hotZoneSize)
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
        console.log('create view')
        viewModel.value = createView(items)
    })

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(async ({ track }) => {
        console.log('visible task')
        track(syncBeacon)

        if (scrollerRef.value) {
            const scroller = scrollerRef.value
            if (syncBeacon.value) {
                const { elem, rect } = syncBeacon.value
                console.log('do sync', await getRendered())
                const curRect = elem.getBoundingClientRect()
                const delta = curRect.left - rect.left
                const prevScrollLeft = scroller.scrollLeft

                // Update scroll on rAF, this reduces flickering in Safari
                // (yet makes not so smooth scroll animation)
                requestAnimationFrame(() => {
                    scroller.scrollLeft += delta
                    console.log('adjust delta', {
                        delta,
                        rect,
                        curRect,
                        prevScrollLeft,
                        newScrollLeft: scroller.scrollLeft,
                        scrollWidth: scroller.scrollWidth,
                        clientWidth: scroller.clientWidth,
                    })
                })
                scrollState.skip = 3
            } else {
                // Initial render, setup view model
                console.log('initial render')
                rebalance()
                setTimeout(() => autocenter(), 100)
                // NB: Qwik delegates events to root, we should handle it on element
                scroller.addEventListener('scroll', () => {

                    clearTimeout(scrollState.autocenterTimeout)
                    scrollState.autocenterTimeout = window.setTimeout(() => {
                        autocenter()
                    }, autocenterDelay)

                    if (scrollState.skip > 0) {
                        // In Safari, it seems that scroll event is scheduled
                        // right before we adjust scrollLeft on rebalance, which
                        // triggers new rebalance with old scroll position but new
                        // view model. This leads to jagged scrolling experience
                        // and invalid list of rendered items. To avoid this,
                        // we skip first scroll event right after rebalance.
                        scrollState.skip--
                        console.log('skip scroll', scroller.scrollLeft)
                        return
                    }

                    if (atViewportEdge(scroller, edgeSize)) {
                        rebalance()
                    }

                    requestAnimationFrame(updateElements)
                })
            }
        }
    }, { strategy: 'document-ready' })

    return <div class={styles.container} ref={scrollerRef}>
        {viewModel.value.items.map(({ id, index }) => {
            return <InfiniteScrollItem item={items[index]} id={id} key={id}/>
        })}
    </div>
})

export const InfiniteScrollItem = component$(({ item, id }: { item: Item, id: ViewModelId }) => {
    return <div class={styles.item} data-anchor={id}>
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