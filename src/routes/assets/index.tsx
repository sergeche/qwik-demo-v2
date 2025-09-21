import { component$, useComputed$, useSignal, useTask$ } from '@qwik.dev/core';

interface PageData {
    image: string
}

export default component$(() => {
    const pageLoaded = useSignal<PageData>({ image: '' });

    return <>
        <button onClick$={() => {
            pageLoaded.value = { image: `${Date.now()}.png` };
            console.log('Button clicked', pageLoaded.value);
        }}>Generate</button>
        <PageContent data={pageLoaded.value} />
    </>
})

export const PageContent = component$((props: { data: PageData }) => {
    console.log('Page content render', props.data);
    const image = useComputed$(() => {
        console.log('Computed run')
        return generateImage(props.data)
    });
    return (
        <div>
            <ResponsiveImage
                image={generateImage(props.data)}
                // Uncomment this line to make it work
                // image={image.value}
                />
        </div>
    )
})

export function generateImage(data: PageData) {
    return data.image;
}

export const ResponsiveImage = component$((props: { image: string }) => {
    const fullImage = useSignal('')
    const computedImage = useComputed$(() => `/computed/path/to/${props.image}`)
    console.log('Responsive image render', props.image);
    useTask$(({ track }) => {
        track(() => props.image);
        console.log('Responsive image task run', props.image);
        fullImage.value = `/path/to/${props.image}`
    });
    return (
        <span>{fullImage.value} {computedImage.value}</span>
    )
});