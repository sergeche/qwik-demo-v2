import { routeLoader$, type DocumentHead } from "@qwik.dev/router";
import { component$ } from "@qwik.dev/core";

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
  return (
    <>
      <h3>Iterate over blocks</h3>
      {pageLoaded.value.blocks.map((block) => {
        if (block.id === 'sidebar') {
          return <SidebarWrapper key={block.id} block={block}/>;
        }
      })}

      <h3>Access block directly</h3>
      <SidebarWrapper block={pageLoaded.value.blocks[0]} />
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
