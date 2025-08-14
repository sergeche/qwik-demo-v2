import { $, component$ } from '@qwik.dev/core';
import { useNavigate } from '@qwik.dev/router';
import { SimpleSelectLanguage } from './select-language';

export const Header = component$(() => {
    const nav = useNavigate();

    const changeLocale$ = $((lang: string) => {
        console.log('navigate to:', lang);
        nav(`/${lang}`);
    });

    return (
        <header style="padding: 10px; background-color: black; color: white;">
            <SimpleSelectLanguage changeLocale={changeLocale$} />
        </header>
    );
});
