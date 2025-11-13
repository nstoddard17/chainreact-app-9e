/**
 * Optional dynamic import helper that avoids bundler resolution failures.
 * Falls back to null when the module cannot be loaded at runtime.
 */
export async function optionalImport<T = any>(moduleName: string): Promise<T | null> {
  try {
    // Use an indirect dynamic import so bundlers don't require the module upfront
    const dynamicImporter = new Function('specifier', 'return import(specifier);');
    return await dynamicImporter(moduleName);
  } catch (error) {
    return null;
  }
}
