import { routeLoader$, type DocumentHead } from "@qwik.dev/router";
import { component$, isServer } from "@qwik.dev/core";
import { BcCmsSidebarFetchData } from '~/components/bc-cms-sidebar/bc-cms-sidebar.data';
import { BcCmsSidebar } from '~/components/bc-cms-sidebar/bc-cms-sidebar.block';

export const usePageData = routeLoader$(async event => {
  if (!isServer) throw new Error('Server only function');
  console.log('get page data for locale', event.locale());
  const data = await BcCmsSidebarFetchData(event);
  return {
    blocks: [
      { id: 'sidebar', data }
    ]
  };
});

export default component$(() => {
  const pageLoaded = usePageData();
  return (
    <>
      {pageLoaded.value.blocks.map(block => {
        if (block.id === 'sidebar') {
          // Lost reactivity!
          return <BcCmsSidebar key={block.id} data={block.data} />;
        }
        return null;
      })}
    </>
  );
});

export const head: DocumentHead = {
  title: "Inner page",
};
