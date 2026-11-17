import { getSlotsForDate, isValidRequestedDate, today } from './database.js';

// Задержка имитирует ответ настоящего сервера и позволяет увидеть загрузку.
const DELAY_MS = 650;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

export default function mockApi() {
  return {
    name: 'frontend-4-mock-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url || '/', 'http://localhost');
        if (!url.pathname.startsWith('/api/')) {
          next();
          return;
        }

        if (request.method !== 'GET') {
          sendJson(response, 405, { error: 'Метод не поддерживается.' });
          return;
        }

        await wait(DELAY_MS);

        // Управляемая ошибка нужна для проверки error-состояния в интерфейсе.
        if (url.searchParams.get('error') === '1') {
          sendJson(response, 500, { error: 'Не удалось загрузить данные. Попробуйте ещё раз.' });
          return;
        }

        if (url.pathname === '/api/booking/today') {
          sendJson(response, 200, today);
          return;
        }

        if (url.pathname === '/api/slots') {
          const date = {
            day: Number(url.searchParams.get('day')),
            month: Number(url.searchParams.get('month')),
            year: Number(url.searchParams.get('year')),
          };

          if (!isValidRequestedDate(date)) {
            sendJson(response, 400, { error: 'Некорректная дата.' });
            return;
          }

          try {
            sendJson(response, 200, { date, slots: getSlotsForDate(date) });
          } catch (error) {
            sendJson(response, 500, { error: error.message || 'Ошибка сервера.' });
          }
          return;
        }

        sendJson(response, 404, { error: 'API-эндпоинт не найден.' });
      });
    },
  };
}
