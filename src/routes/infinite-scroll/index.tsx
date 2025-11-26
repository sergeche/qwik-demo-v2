import { $, component$ } from '@qwik.dev/core';
import { InfiniteScroll } from '~/components/infinite-scroll';
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
    const showDesktop = true;
    const showMobile = true;
    return <>
        {showDesktop && <div style="padding:20px;">
            <div style="background:#fff;margin: 10px 0;overflow: hidden;">
                <InfiniteScroll items={items}
                    render={itemRender} />
            </div>
        </div>}
        {showMobile && <div>
            <div style="background:#fff;margin: 10px auto;width: 400px; overflow: hidden;">
                <InfiniteScroll
                    mobile={true}
                    items={items}
                    render={itemRender}
                    offscreenItems={items.length} />
            </div>
        </div>}
    </>
})

const itemRender = $((item: Item, active: boolean, mobile: boolean) => {
    const styles = mobile ? stylesMobile : stylesDesktop;
    return <div class={styles.product}>
        <a href={`/product/${item.id}`}>
            <div class={styles.productBg} style={item.bgImage ? `background-image: url('${item.bgImage}');` : undefined}>
                <h3>{item.title}</h3>
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
})

