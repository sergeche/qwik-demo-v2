import type { QRL, JSX } from '@qwik.dev/core'

export type ViewModelId = number

export interface ViewModelItem {
    /** Unique item id */
    id: ViewModelId
    /** Reference to original item index in item list */
    index: number
}

export interface ViewModel {
    /** Items to render (previous, current, next) */
    items: ViewModelItem[]
    /** Total amount of distinct items to render */
    totalItems: number
    /** Internal ID counter */
    _id: number
}

export interface SyncBeacon {
    id: ViewModelId
    elem: HTMLElement
    rect: DOMRect
    scrollLeft: number
}

export type RebalancedState = ViewModelItem[]

export type InfiniteListItemRenderer<T> = (item: T, active: boolean, mobile: boolean, internalId: ViewModelId) => JSX.Element

export interface InfiniteScrollProps<T> {
    /** List of items to render */
    items: T[]

    /** Function to render individual item */
    render: QRL<InfiniteListItemRenderer<T>>

    /**
     * Whether to use mobile-optimized rendering.
     * If not set, the component will try to detect platform automatically.
     */
    mobile?: boolean

    /**
     * Amount of items to render offscreen (before and after visible one).
     * _MOBILE-only_
     * @default 1
     */
    offscreenItems?: number

    /**
     * Size of the edge in pixels, relative to which we will determine
     * the need to update the virtual list.
     * _DESKTOP-only_
     */
    edgeSize?: number

    /**
     * Delay before autocentering after scroll
     * _DESKTOP-only_
     */
    autocenterDelay?: number

    /**
     * Percentage of scroll area where animation should begin
     * _DESKTOP-only_
     */
    hotZoneSize?: number

    /**
     * Max length of animated scroll distance. Use this properly to limit the
     * distance animation should travel to make animation snappy and smooth
     */
    maxAnimatedScrollSize?: number

    /**
     * If set, allows user to focus on scroller root with Tab key and read its
     * label by screen readers. User then have to use Enter key to activate
     * focused item and use arrows to navigate.
     * If `false`, user will focus directly on active item.
     */
    allowRootFocus?: boolean

    /** Value for `aria-label` attribute on the scroller root element */
    ariaLabel?: string
}

export interface AnimateScrollOptions {
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

export interface ScrollState {
    /** Prevent scroll event handling during programmatic scrolls */
    isScrolling: boolean

    /** Whether user is currently touching the scroller */
    isTouching: boolean

    /** Timeout for detecting scroll end */
    scrollEndTimeout?: number

    /** Amount of scroll cycles to skip for better virtual scroll handling */
    skip: number

    /** Handler to stop animated scroll */
    animatedScroll?: ((cancel?: boolean) => void) | null
}

/**
 * Rebalance strategy based on fixed item size: fill available container width
 * and overscroll area with items of known size.
 */
export interface RebalanceStrategyBySize {
    type: 'by-size',
    size: number
    container: HTMLElement
}

/**
 * Rebalance strategy based on fixed item count: render given number of items
 */
export interface RebalanceStrategyByCount {
    type: 'by-count',
    count: number
}

export type RebalanceStrategy = RebalanceStrategyBySize | RebalanceStrategyByCount