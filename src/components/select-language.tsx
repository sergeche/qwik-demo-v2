import { component$, QRL } from '@qwik.dev/core';
import { useLocale } from '~/composables/useLocale';

const languages = ['sr', 'en']

interface Props {
    changeLocale?: QRL<(lang: string) => void>;
}

export const SimpleSelectLanguage = component$<Props>(props => {
    const locale = useLocale();
    return (
        <div>
            <select
                onChange$={(e) => props.changeLocale?.((e.target as HTMLSelectElement).value) }
                name="language"
                value={locale.lang}
            >
                {languages.map((item) => (
                    <option key={item} selected={locale.lang === item}>
                        {item}
                    </option>
                ))}
            </select>
        </div>
    );
});