import { $, component$ } from '@qwik.dev/core';
import { InfiniteScroll as InfiniteScrollDesktop } from '~/components/infinite-scroll';
import { InfiniteScroll as InfiniteScrollMobile } from '~/components/infinite-scroll-mobile';
import img1 from '~/assets/p1.webp'
import img2 from '~/assets/p2.webp'
import img3 from '~/assets/p3.webp'
import img4 from '~/assets/p4.webp'
import img5 from '~/assets/p5.webp'
import stylesDesktop from './product.module.css';
import stylesMobile from './product-mobile.module.css';

interface Item {
    id: number
    title: string
    price: string
    image: string
    bgImage?: string
}

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

export default component$(() => {
    const showMobile = false;
    return <>
        <div style="padding:20px;">
            <h2>Infinite Scroll - Desktop</h2>
            <div style="background:#fff;margin: 10px 0;overflow: hidden;">
                <InfiniteScrollDesktop items={items}
                    render={itemRenderDesktop} />
            </div>
        </div>
        {showMobile && <div style="padding:20px;">
            <h2>Infinite Scroll - Mobile</h2>

            <div style="background:#fff;margin: 10px auto;width: 400px; overflow: hidden;">
                <InfiniteScrollMobile items={items} render={itemRenderMobile} />
            </div>
        </div>}
    </>
})

const itemRenderDesktop = $((item: Item, active: boolean) => {
    return <ListItemDesktop item={item} active={active} />
})

const itemRenderMobile = $((item: Item, active: boolean) => {
    return <ListItemMobile item={item} active={active} />
})

export const ListItemDesktop = component$(({ item }: { item: Item, active: boolean }) => {
    return <div class={stylesDesktop.product}>
        <a href={`/product/${item.id}`}>
            <div class={stylesDesktop.productBg} style={item.bgImage ? `background-image: url('${item.bgImage}');` : undefined}>
                <h3>{item.title}</h3>
            </div>
            <div class={stylesDesktop.productImage}>
                <img src={item.image} width={100} height={100} alt="" />
            </div>
        </a>
        <div class={stylesDesktop.productInfo}>
            <h4>Akcijska cena:</h4>
            <div class={stylesDesktop.productPrice}>{item.price}</div>
            <div class={stylesDesktop.productPrevPrice}>Osnovna cena: 1.299,00 RSD</div>
            <div class={stylesDesktop.productComment}>Akcija važi od 28. jula do 4. avgusta.</div>
            <button>Dodaj u korpu</button>
        </div>
    </div>
})

export const ListItemMobile = component$(({ item }: { item: Item, active: boolean }) => {
    return <div class={stylesMobile.product}>
        <a href={`/product/${item.id}`}>
            <div class={stylesMobile.productBg} style={item.bgImage ? `background-image: url('${item.bgImage}');` : undefined}>
                <h3>{item.title}</h3>
            </div>
            <div class={stylesMobile.productImage}>
                <img src={item.image} width={100} height={100} alt="" />
            </div>
        </a>
        <div class={stylesMobile.productInfo}>
            <h4>Akcijska cena:</h4>
            <div class={stylesMobile.productPrice}>{item.price}</div>
            <div class={stylesMobile.productPrevPrice}>Osnovna cena: 1.299,00 RSD</div>
            <div class={stylesMobile.productComment}>Akcija važi od 28. jula do 4. avgusta.</div>
            <button>Dodaj u korpu</button>
        </div>
    </div>
})