import { ICONS, type IconName } from './icons';

/** Renders one of our static, trusted SVG icons. */
export function Icon({ name, label }: { name: IconName; label?: string }) {
  return (
    <span
      class="icon-wrap"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}
