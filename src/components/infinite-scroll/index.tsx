import { $, component$, useComputed$, useConstant, useSignal, useTask$, useVisibleTask$ } from '@qwik.dev/core'
import styles from './infinite-scroll.module.css'
import { animateScroll, createView, getAnchor, getAnchorId, getCenter, getItemElements, getItemSize, rebalanceItems, updateScrollAnimationState, whenRendered } from './shared'
import type { AnimateScrollOptions, InfiniteScrollProps, RebalanceStrategy, ScrollState, SyncBeacon, ViewModel, ViewModelId } from './types'

const scrollEndDelay = 250

export { styles }

export const InfiniteScroll = component$<InfiniteScrollProps<any>>(props => {
    const {
        items,
        render,
        edgeSize = 200,
        autocenterDelay = 500,
        maxAnimatedScrollSize = 400,
        hotZoneSize = 0.4,
        offscreenItems = 1,
    } = props

    const isMobile = useSignal<boolean>(props.mobile ?? false)

    /** Reference to scroller element */
    const scrollerRef = useSignal<HTMLDivElement>()
    /** Current view model with items to render */
    const viewModel = useSignal(createView(items))
    /** Item width  */
    const itemSize = useSignal(0)
    /** A special object to synchronize scroll position */
    const syncBeacon = useSignal<SyncBeacon | null>(null)
    /** Anchor element: the one that closer to center */
    const anchor = useSignal<HTMLElement | null>(null)
    /** ID of anchor element */
    const anchorId = useComputed$(() => anchor.value ? getAnchorId(anchor.value) : null)
    /** ID of currently active element */
    const activeId = useSignal<ViewModelId>(0)
    /** Internal scroller state */
    const scrollState = useConstant<ScrollState>({
        isScrolling: false,
        isTouching: false,
        skip: 0,
        scrollEndTimeout: 0,
    })
    const platformClass = useComputed$(() => isMobile.value ? styles._mobile : styles._desktop)

    const rebalance = $((): SyncBeacon | null => {
        const scroller = scrollerRef.value!
        if (anchor.value && anchorId.value) {
            if (!itemSize.value) {
                itemSize.value = getItemSize(scroller)
            }

            const strategy: RebalanceStrategy = isMobile.value
                ? {
                    type: 'by-count',
                    count: offscreenItems,
                } : {
                    type: 'by-size',
                    container: scroller,
                    size: itemSize.value
                }

            const rebalanced = rebalanceItems(viewModel.value, anchorId.value, strategy)

            viewModel.value = {
                ...viewModel.value,
                items: rebalanced
            }
            // Disable scroll snapping during view model update to avoid
            // misaligned scroll in Safari iOS
            disableScrollSnapping(scroller)

            return {
                id: anchorId.value,
                elem: anchor.value,
                rect: anchor.value.getBoundingClientRect(),
                scrollLeft: scroller.scrollLeft
            }
        }

        return null
    })

    const rebalanceWhenNeeded = $(async () => {
        const scroller = scrollerRef.value
        if (!scroller) {
            return
        }

        let needRebalance = false

        if (isMobile.value) {
            needRebalance = !scrollState.isScrolling && !scrollState.isTouching
        } else {
            needRebalance = !scrollState.animatedScroll && atViewportEdge(scroller, edgeSize)
        }

        if (needRebalance) {
            syncBeacon.value = await rebalance()
            // TODO change for both platforms?
            if (syncBeacon.value && isMobile.value) {
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

        // Cancel active animation, if any
        await stopAnimatedScroll()

        // Disable scroll snapping during animated scroll (won’t animate otherwise).
        disableScrollSnapping(scroller)

        const stop = animateScroll(scroller, {
            ...options,
            callback(cancel) {
                if (scrollState.animatedScroll === stop) {
                    scrollState.animatedScroll = null
                    enableScrollSnapping(scroller)
                }
                options.callback?.(cancel)

                // By default, rebalancing is locked during animated scroll since
                // Qwik may not apply DOM changes on next task after view model update.
                if (!cancel) {
                    scrollState.isScrolling = false
                    rebalanceWhenNeeded()
                }
            }
        })

        return scrollState.animatedScroll = stop
    })

    const activateItemWithOffset = $(async (offset: number) => {
        if (scrollState.animatedScroll) {
            return
        }

        if (isMobile.value && (scrollState.isScrolling || scrollState.isTouching)) {
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

        if (!scroller || !anchor.value || scrollState.animatedScroll) {
            return
        }

        const distance = getCenter(anchor.value) - getCenter(scroller)
        const id = getAnchorId(anchor.value)

        if (Math.abs(distance) > 1) {
            startAnimatedScroll({
                to: scroller.scrollLeft + distance,
                duration: 300,
                callback(cancel) {
                    if (!cancel) {
                        activeId.value = id
                    }
                },
            })
        } else {
            activeId.value = id
        }
    })

    const updateElements = $(() => {
        const scroller = scrollerRef.value
        if (!scroller) {
            return
        }

        updateScrollAnimationState(scroller, isMobile.value ? 0 : hotZoneSize)
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

        if (scrollState.animatedScroll || !scroller) {
            return
        }

        const activeElem = Array.from(getItemElements(scroller)).find(elem => getAnchorId(elem) === activeId.value)
        if (activeElem) {
            const delta = getCenter(activeElem) - getCenter(scroller)
            if (delta) {
                startAnimatedScroll({
                    to: scroller.scrollLeft + delta,
                    duration: 300,
                    absolute: isMobile.value,
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
                if (delta) {
                    scroller.scrollLeft += delta
                }
                // Enable scroll snapping on next tick to avoid misaligned scroller in Safari iOS
                setTimeout(() => {
                    enableScrollSnapping(scroller)
                }, 1)
            })
            scrollState.skip = 3
        } else {
            // Initial render, setup view model
            anchor.value = getAnchor(scroller)
            const sync = await rebalance()
            whenRendered(scroller, viewModel.value, () => {
                requestAnimationFrame(() => {
                    if (sync) {
                        const anchorCenter = getCenter(sync.elem)
                        const scrollCenter = getCenter(scroller)
                        const delta = anchorCenter - scrollCenter
                        if (delta) {
                            scroller.scrollLeft += delta
                        }
                        activeId.value = sync.id
                        enableScrollSnapping(scroller)
                    }
                })
            })

            // NB: Qwik delegates events to root, we should handle it on element
            scroller.addEventListener('scroll', async () => {
                scrollState.isScrolling = true
                clearTimeout(scrollState.scrollEndTimeout)
                scrollState.scrollEndTimeout = window.setTimeout(() => {
                    scrollState.isScrolling = false
                    if (isMobile.value) {
                        rebalanceWhenNeeded()
                    } else {
                        autocenter()
                    }
                }, isMobile.value ? scrollEndDelay : autocenterDelay)

                // Always update anchor during scroll
                anchor.value = getAnchor(scroller)
                updateElements()

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

                if (!isMobile.value) {
                    rebalanceWhenNeeded()
                }
            })

            scroller.addEventListener('touchstart', () => {
                scrollState.isTouching = true
            })
            scroller.addEventListener('touchend', () => {
                scrollState.isTouching = false
            })
        }
    })

    return <div class={[styles.container, platformClass.value]}>
        <button class={[styles.control, styles.controlLeft]} onClick$={() => activateItemWithOffset(-1)}>←</button>
        <button class={[styles.control, styles.controlRight]} onClick$={() => activateItemWithOffset(1)}>→</button>
        <div class={[styles.scroller, platformClass.value]} ref={scrollerRef}>
            {viewModel.value.items.map(({ id, index }) => {
                const active = anchorId.value === id
                return <div class={['infinite-scroll-item', styles.item, platformClass.value]} data-active={active} data-anchor={id} key={id}>
                    {render(items[index], active, isMobile.value, id)}
                </div>
            })}
        </div>
        {
            isMobile.value && <div class={styles.indicators}>
                {items.map((item, ix) => <div class={[styles.indicator, isAnchor(item) && styles.indicatorActive]} key={ix}></div>)}
            </div>
        }
    </div>
})

/**
 * Returns true if scroll is at viewport edge
 */
function atViewportEdge(scroller: HTMLElement, edgeSize: number): boolean {
    const { scrollLeft, scrollWidth, clientWidth } = scroller
    return scrollLeft < edgeSize
        || scrollWidth - clientWidth - scrollLeft < edgeSize
}

function disableScrollSnapping(scroller: HTMLElement) {
    if (styles._disable_snapping) {
        scroller.classList.add(styles._disable_snapping)
    }
}

function enableScrollSnapping(scroller: HTMLElement) {
    if (styles._disable_snapping) {
        scroller.classList.remove(styles._disable_snapping)
    }
}
