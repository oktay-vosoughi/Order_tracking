const API_BASE = import.meta.env.VITE_API_URL || '/api';

export async function fetchState() {
  const response = await fetch(`${API_BASE}/state`);
  if (!response.ok) {
    throw new Error('Veri çekilirken hata oluştu');
  }
  return response.json();
}

export async function persistState(items, purchases, distributions) {
  const response = await fetch(`${API_BASE}/state`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ items, purchases, distributions })
  });

  if (!response.ok) {
    throw new Error('Veri kaydedilirken hata oluştu');
  }

  return response.json();
}
