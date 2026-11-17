// Имитация базы данных. Месяц в API — 0-индексный (январь = 0).
const now = new Date();
export const today = Object.freeze({
  day: now.getDate(),
  month: now.getMonth(),
  year: now.getFullYear(),
});

// Два набора расписания: первый используется для сегодняшнего дня,
// второй — для остальных дат (с переключением по чётности дня месяца).
const SLOT_SET_A = [
  { time: '10:00', available: true },
  { time: '10:30', available: false },
  { time: '11:00', available: true },
  { time: '11:30', available: true },
  { time: '12:00', available: true },
  { time: '12:30', available: false },
  { time: '13:00', available: true },
  { time: '13:30', available: true },
  { time: '14:00', available: false },
  { time: '14:30', available: true },
  { time: '15:00', available: true },
  { time: '15:30', available: true },
  { time: '16:00', available: false },
  { time: '16:30', available: true },
  { time: '17:00', available: true },
  { time: '17:30', available: false },
  { time: '18:00', available: true },
  { time: '18:30', available: true },
  { time: '19:00', available: true },
  { time: '19:30', available: false },
  { time: '20:00', available: true },
  { time: '20:30', available: true },
];

const SLOT_SET_B = [
  { time: '10:00', available: false },
  { time: '10:30', available: true },
  { time: '11:00', available: true },
  { time: '11:30', available: false },
  { time: '12:00', available: true },
  { time: '12:30', available: true },
  { time: '13:00', available: false },
  { time: '13:30', available: true },
  { time: '14:00', available: true },
  { time: '14:30', available: true },
  { time: '15:00', available: false },
  { time: '15:30', available: true },
  { time: '16:00', available: true },
  { time: '16:30', available: false },
  { time: '17:00', available: true },
  { time: '17:30', available: true },
  { time: '18:00', available: false },
  { time: '18:30', available: true },
  { time: '19:00', available: true },
  { time: '19:30', available: true },
  { time: '20:00', available: false },
  { time: '20:30', available: true },
];

function isValidDateParts(day, month, year) {
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return false;
  }
  if (month < 0 || month > 11 || year < 1970 || day < 1 || day > 31) return false;
  const candidate = new Date(year, month, day);
  return candidate.getFullYear() === year &&
    candidate.getMonth() === month &&
    candidate.getDate() === day;
}

export function getSlotsForDate({ day, month, year }) {
  if (!isValidDateParts(day, month, year)) {
    throw new Error('Некорректная дата.');
  }

  const isToday = day === today.day && month === today.month && year === today.year;
  const source = isToday || day % 2 === 0 ? SLOT_SET_A : SLOT_SET_B;

  // Возвращаем копии, чтобы вызывающий код не мог изменить исходные данные.
  return source.map((slot) => ({ ...slot }));
}

export function isValidRequestedDate({ day, month, year }) {
  return isValidDateParts(day, month, year);
}


// Демонстрационные категории услуг. Количество услуг задано по условию задания.
export const categories = Object.freeze([
  Object.freeze({ id: 1, name: 'Стрижки и укладки', servicesCount: 5 }),
  Object.freeze({ id: 2, name: 'Маникюр и педикюр', servicesCount: 5 }),
  Object.freeze({ id: 3, name: 'Брови и ресницы', servicesCount: 4 }),
  Object.freeze({ id: 4, name: 'Спа-процедуры', servicesCount: 4 }),
]);

export function getCategories() {
  return categories.map((category) => ({ ...category }));
}

export function getCategoryById(categoryId) {
  if (!Number.isInteger(categoryId)) return null;
  const category = categories.find((item) => item.id === categoryId);
  return category ? { ...category } : null;
}
