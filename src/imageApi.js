const PIXABAY_ENDPOINT = 'https://pixabay.com/api/';

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`pixabay status ${res.status}`);
  return res.json();
}

export async function getRandomIslamicImage(query = 'ramadan dua islamic') {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) throw new Error('PIXABAY_API_KEY is missing');
  try {
    const url = `${PIXABAY_ENDPOINT}?key=${key}&q=${encodeURIComponent(query)}&image_type=photo&orientation=horizontal&lang=ar&per_page=50&safesearch=true`;
    const data = await fetchJson(url);
    const hits = Array.isArray(data?.hits) ? data.hits : [];
    if (!hits.length) return null;
    const hit = hits[Math.floor(Math.random() * hits.length)];
    return hit.largeImageURL || hit.webformatURL || null;
  } catch {
    return null;
  }
}

export async function getPixabayImages(query = 'ramadan dua islamic', limit = 5) {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) throw new Error('PIXABAY_API_KEY is missing');
  const url = `${PIXABAY_ENDPOINT}?key=${key}&q=${encodeURIComponent(query)}&image_type=photo&orientation=horizontal&lang=ar&per_page=${Math.min(Math.max(limit, 3), 10)}&safesearch=true`;
  const data = await fetchJson(url);
  const hits = Array.isArray(data?.hits) ? data.hits : [];
  return hits.map((h) => h.largeImageURL || h.webformatURL).filter(Boolean).slice(0, limit);
}
