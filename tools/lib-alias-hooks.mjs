const LIB = new URL('../src/lib/', import.meta.url);

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('#lib/')) {
    const rest = specifier.slice('#lib/'.length);
    return next(new URL(/\.\w+$/.test(rest) ? rest : `${rest}.ts`, LIB).href, context);
  }
  return next(specifier, context);
}
