import jsQR from "jsqr";

export async function decodeQr(image: Buffer | string): Promise<string | undefined> {
  try {
    const { default: sharp } = await import("sharp");
    const { data, info } = await sharp(image)
      .rotate()
      .toColourspace("srgb")
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
    return jsQR(pixels, info.width, info.height)?.data;
  } catch {
    return undefined;
  }
}
