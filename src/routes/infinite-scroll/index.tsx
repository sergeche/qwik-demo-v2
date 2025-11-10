import { component$ } from '@qwik.dev/core';
import { InfiniteScroll, type Item } from '~/components/infinite-scroll';

export default component$(() => {
    const items: Item[] = [
        { id: 1, label: 'Item 1' },
        { id: 2, label: 'Item 2' },
        { id: 3, label: 'Item 3' },
        { id: 4, label: 'Item 4' },
        { id: 5, label: 'Item 5' },
    ]

    return <div class="wrapper" style="background:#fff;margin: 10px 0;">
        <InfiniteScroll items={items} />
    </div>
})