export const MONTHS_NOMINATIVE = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

export const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

export const DAYS_OF_WEEK = [
  'Воскресенье', 'Понедельник', 'Вторник', 'Среда',
  'Четверг', 'Пятница', 'Суббота',
];

export const WEEKDAY_HEADERS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export const DAYS_OF_WEEK_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

// Строит сетку календаря. Неделя начинается с понедельника.
// Пустые ячейки представлены значением null.
export function buildCalendarGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const leadDays = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const weeks = [];
  let week = new Array(leadDays).fill(null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    week.push(new Date(year, month, day));
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }

  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  return weeks;
}

// Сравнивает даты без учёта времени: -1, 0 или 1.
export function compareDates(date1, date2) {
  const first = new Date(date1);
  const second = new Date(date2);
  first.setHours(0, 0, 0, 0);
  second.setHours(0, 0, 0, 0);

  if (first < second) return -1;
  if (first > second) return 1;
  return 0;
}

// Прошедшие даты нельзя выбрать.
export function isDateSelectable(day, month, year, today) {
  const date = new Date(year, month, day);
  return compareDates(date, today) >= 0;
}

export function formatDateLong(date) {
  return `${DAYS_OF_WEEK[date.getDay()]}, ${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatDateShort(date) {
  return `${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]}, ${DAYS_OF_WEEK_SHORT[date.getDay()]}`;
}
