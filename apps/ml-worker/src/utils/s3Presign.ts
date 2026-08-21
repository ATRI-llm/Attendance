/**
 * Resolves image URLs for ML worker processing.
 * With local storage, URLs are directly accessible over HTTP.
 */
export async function presignImageUrls(urls: string[]): Promise<string[]> {
  return urls;
}