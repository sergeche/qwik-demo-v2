import { component$ } from '@qwik.dev/core';

export type SidebarItem = {
  href?: string;
  label: string;
  count?: number;
};

export const Sidebar = component$((props: { sidebarItems: SidebarItem[] }) => {
    return (
      <>
        <ul class="sidebar-component">
          {props.sidebarItems.map((item, index) => (
            <li key={index}>{item.label}</li>
          ))}
        </ul>
      </>
    );
  },
);
