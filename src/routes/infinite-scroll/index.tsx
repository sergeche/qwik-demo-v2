import { component$ } from '@qwik.dev/core';
import { InfiniteScroll, type Item } from '~/components/infinite-scroll';
import img1 from '~/assets/p1.webp'
import img2 from '~/assets/p2.webp'
import img3 from '~/assets/p3.webp'
import img4 from '~/assets/p4.webp'
import img5 from '~/assets/p5.webp'

export default component$(() => {
    const items: Item[] = [
        {
            id: 1,
            title: 'Knjiga Nedelje',
            image: img1,
            bgImage: 'https://picsum.photos/id/89/400/600',
            price: '899,00 RSD'

        },
        {
            id: 2,
            title: 'Knjiga Nedelje',
            image: img2,
            bgImage: 'https://picsum.photos/id/115/400/600',
            price: '899,00 RSD'

        },
        {
            id: 3,
            title: 'Knjiga Nedelje',
            image: img3,
            price: '899,00 RSD'

        },
        {
            id: 4,
            title: 'Knjiga Nedelje',
            image: img4,
            price: '899,00 RSD',
            bgImage: 'https://picsum.photos/id/122/400/600',
        },
        {
            id: 5,
            title: 'Knjiga Nedelje',
            image: img5,
            price: '899,00 RSD',
            bgImage: 'https://picsum.photos/id/135/400/600',
        },
    ]

    return <div class="wrapper" style="background:#fff;margin: 10px 0;">
        <InfiniteScroll items={items} />
    </div>
})