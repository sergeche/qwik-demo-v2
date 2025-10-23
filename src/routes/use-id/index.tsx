import { component$, useId, useSignal } from '@qwik.dev/core'

export default component$(() => {
    const enabled = useSignal(false)

    return <div>
        <h1>useId Example</h1>
        <Checkbox label="Item 1" />
        <Checkbox label="Item 2" />
        <div style="margin:10px 0">
            <button onClick$={() => { enabled.value = !enabled.value }}>
                {enabled.value ? 'Hide' : 'Show'} more checkboxes
            </button>
        </div>

        {enabled.value && <div>
            <Checkbox label="Subitem 1" />
            <Checkbox label="Subitem 2" />
        </div>}

    </div>

})

export const Checkbox = component$((props: { label: string }) => {
    const id = useId()
    return <div>
        <input type="checkbox" id={id} />
        <label for={id}>{ props.label }</label>
    </div>

})