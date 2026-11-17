import { getCategoryById, getCategories, getSlotsForDate, isValidRequestedDate, today } from './database.js';

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
        const isCategoryRoute = url.pathname === '/categories' || /^\/categories\/\d+\/?$/.test(url.pathname);
        if (!url.pathname.startsWith('/api/') && !isCategoryRoute) {
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

        // Поддерживаем как адреса из задания (/categories), так и
        // единый API-префикс проекта (/api/categories).
        const pathname = url.pathname.startsWith('/api/')
          ? url.pathname.slice(4)
          : url.pathname;

        if (pathname === '/booking/today') {
          sendJson(response, 200, today);
          return;
        }

        if (pathname === '/categories') {
          sendJson(response, 200, getCategories());
          return;
        }

        const categoryMatch = pathname.match(/^\/categories\/(\d+)\/?$/);
        if (categoryMatch) {
          const category = getCategoryById(Number(categoryMatch[1]));
          if (!category) {
            sendJson(response, 404, { error: 'Category not found' });
            return;
          }
          sendJson(response, 200, category);
          return;
        }

        if (pathname === '/slots') {
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
