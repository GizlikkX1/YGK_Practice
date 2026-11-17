async function getJson(url, { signal } = {}) {
  let response;
  try {
    response = await fetch(url, { method: 'GET', signal });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Не удалось связаться с сервером. Проверьте подключение и попробуйте ещё раз.');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Сервер вернул некорректный ответ.');
  }

  if (!response.ok) {
    throw new Error(payload?.error || `Ошибка сервера (${response.status}).`);
  }

  return payload;
}

export async function fetchToday(options = {}) {
  const query = options.simulateError ? '?error=1' : '';
  const data = await getJson(`/api/booking/today${query}`, options);

  if (!Number.isInteger(data.day) || !Number.isInteger(data.month) || !Number.isInteger(data.year)) {
    throw new Error('Сервер вернул некорректную дату.');
  }

  return data;
}

export async function fetchSlots(date, options = {}) {
  const params = new URLSearchParams({
    day: String(date.getDate()),
    month: String(date.getMonth()),
    year: String(date.getFullYear()),
  });
  if (options.simulateError) params.set('error', '1');

  const data = await getJson(`/api/slots?${params.toString()}`, options);
  if (!data.date || !Array.isArray(data.slots)) {
    throw new Error('Сервер вернул некорректные данные о свободном времени.');
  }

  return data;
}
