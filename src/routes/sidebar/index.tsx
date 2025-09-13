import { routeLoader$, type DocumentHead } from "@qwik.dev/router";
import { component$, useComputed$, useStore } from "@qwik.dev/core";

interface SidebarItem {
  label: string
}

interface Block {
  id: string;
  data: SidebarItem[]
}

interface PageData {
  locale: string;
  blocks: Block[];
}

export const usePageData = routeLoader$<PageData>(async event => {
  const locale = event.locale() ?? 'en'
  console.log('get page data for locale', locale);
  const block: Block = {
    id: 'sidebar',
    data: [
      { label: `Dashboard (${locale})` },
      { label: `Help (${locale})` },
    ]
  };

  return {
    locale,
    blocks: [block],
  };
});

export default component$(() => {
  const pageLoaded = usePageData();
  const blocks = useComputed$(() => pageLoaded.value);
  const store = useStore(pageLoaded.value)

  return (
    <>
      <h3>Iterate over blocks</h3>
      {pageLoaded.value.blocks.map((block) => {
        if (block.id === 'sidebar') {
          return (
            <>
              <SidebarWrapper key={block.id} block={block}/>
            </>
          );
        }
      })}

      <h3>From store</h3>
      {store.blocks.map((block) => {
        if (block.id === 'sidebar') {
          return (
            <>
              <SidebarWrapper key={block.id} block={block} />
              <button onClick$={() => {
                block.data[0].label += 'Q'
                console.log('Modified', block)
              }}>Modify block</button>
            </>
          );
        }
      })}

      <h3>Maintain object path</h3>
      {blocks.value.blocks.map((block, i) => {
        if (block.id === 'sidebar') {
          console.log('Block', blocks.value.blocks[i])
          return (
            <>
              <SidebarWrapper key={block.id} block={pageLoaded.value.blocks[i]} />
            </>
        );
        }
      })}
    </>
  );
});

export const SidebarWrapper = component$((props: { block: Block }) => {
  return (
    <div class="flex flex-auto pt-14">
        <p>Main block output</p>
        <ul class="bc-cms-block main-block">
          {props.block.data.map((item, index) => (
            <li key={index}>{item.label}</li>
          ))}
        </ul>

        <p>Sidebar</p>
        <Sidebar items={props.block.data} />
      </div>
  );
});

export const Sidebar = component$((props: { items: SidebarItem[] }) => {
    return (
      <>
        <ul class="sidebar-component">
          {props.items.map((item, index) => (
            <li key={index}>{item.label}</li>
          ))}
        </ul>
      </>
    );
  },
);

export const head: DocumentHead = {
  title: "Inner page",
};
