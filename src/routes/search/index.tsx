import { component$, useComputed$ } from '@qwik.dev/core';
import { routeLoader$, useLocation, useNavigate } from '@qwik.dev/router';

interface Item {
    label: string
}

interface PageData {
    prefix: string;
    items: Item[];
}

interface PropsWithItems {
    items: Item[];
}

export const usePageData = routeLoader$<PageData>(async event => {
    const totalItems = Math.round(Math.random() * 9) + 1
    const prefix = event.url.searchParams.get('prefix') ?? ''

    const items: Item[] = Array.from({ length: totalItems }).map((_, i) => ({
        label: `${prefix} Item ${i + 1}`
    }))

    return { prefix, items };
});

export default component$(() => {
    const pageLoaded = usePageData();
    return <PageContent data={pageLoaded.value} />;
})

export const PageContent = component$((props: { data: PageData }) => {
    return (
        <div style="display: flex; flex-direction: column; gap: 16px;justify-content: flex-start; align-items: start;">
            <ToggleSearch />
            <Filters prefix={props.data.prefix} />
            <ItemList items={props.data.items} />
        </div>
    )
})

export const ItemList = component$((props: PropsWithItems) => {
    const { url } = useLocation();
    return (
        <ul>
            {props.items.map((item, index) => (
                <li key={index}>{item.label}</li>
            ))}
        </ul>
    )
});

export const Filters = component$((props: { prefix: string }) => {
    const { url } = useLocation();
    const appliedPrefixes = useComputed$(() => {
        // Uncomment this line and see the issue:
        url.searchParams
        console.log('Filters recomputed');
        return props.prefix ? [props.prefix] : [];
    })

    return (
        <div>
            {appliedPrefixes.value.length > 0 && (
                <div>
                    Applied prefixes:
                    {appliedPrefixes.value.map((prefix, index) => (
                        <span key={index}>{prefix}</span>
                    ))}
                </div>
            )}
        </div>
    )
})

export const ToggleSearch = component$(() => {
    const nav = useNavigate();
    return (
        <button onClick$={() => {
            const url = location.href.includes('prefix')
                ? '/search/'
                : '/search/?prefix=Qwik';
            nav(url);
        }}>Toggle Search Param</button>
    )
})