/** Reads a custom property from a Tiled object (Phaser keeps the raw property array). */
export function prop<T extends string | number | boolean>(
  obj: Phaser.Types.Tilemaps.TiledObject,
  name: string,
  fallback: T,
): T {
  const props = obj.properties as Array<{ name: string; value: unknown }> | undefined;
  const p = props?.find((x) => x.name === name);
  return (p?.value as T | undefined) ?? fallback;
}
