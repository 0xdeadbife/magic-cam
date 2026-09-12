// Keep runtime assets and the output popup beside the deployed index.html.
// Public Worker scripts resolve their own dependencies relative to self.location.
export function appUrl(path: string): string {
  return new URL(path, new URL(import.meta.env.BASE_URL, document.baseURI))
    .href;
}
