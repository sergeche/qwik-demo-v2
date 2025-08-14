import { routeLoader$, type DocumentHead } from "@qwik.dev/router";
import { component$, isServer } from "@qwik.dev/core";
import { BcCmsSidebarFetchData } from '~/components/bc-cms-sidebar/bc-cms-sidebar.data';
import { BcCmsSidebar } from '~/components/bc-cms-sidebar/bc-cms-sidebar.block';

export const usePageData = routeLoader$(async event => {
  if (!isServer) throw new Error('Server only function');
  console.log('get page data for locale', event.locale());
  const data = await BcCmsSidebarFetchData(event);
  return { page: data };
});

export default component$(() => {
  const pageLoaded = usePageData();
  return (
    <>
      <BcCmsSidebar data={pageLoaded.value.page} />
    </>
  );
});

export const head: DocumentHead = {
  title: "Inner page",
};
