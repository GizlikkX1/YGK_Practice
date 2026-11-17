'use strict';

// ============================================================
// 1. ДАННЫЕ (константы, не зависящие от DOM)
// ============================================================

const MONTHS_NOMINATIVE = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];

const DAYS_OF_WEEK = [
  'Воскресенье', 'Понедельник', 'Вторник', 'Среда',
  'Четверг', 'Пятница', 'Суббота'
];

const DAYS_OF_WEEK_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const WEEKDAY_HEADERS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

// Группы слотов: [название, начало (мин), конец (мин)]
const SLOT_GROUPS = [
  ['Утро', 10 * 60, 12 * 60],
  ['День', 12 * 60, 17 * 60],
  ['Вечер', 17 * 60, 21 * 60]
];
const SLOT_STEP = 30; // слоты каждые 30 минут
const WORK_START = 10 * 60;   // 10:00
const WORK_END = 21 * 60;     // 21:00 (последний слот 20:30)

// «Сегодня» — с обнулённым временем, чтобы сравнивать только даты
const today = new Date();
today.setHours(0, 0, 0, 0);

// ============================================================
// 2. СОСТОЯНИЕ (то, что меняется при кликах)
// ============================================================

const state = {
  currentYear: today.getFullYear(),
  currentMonth: today.getMonth(), // месяц 0-индексный, как в Date
  selectedDate: new Date(today),  // по умолчанию выбран «сегодня»
  selectedTime: null              // время ещё не выбрано
};

// ============================================================
// 3. ЧИСТЫЕ ФУНКЦИИ (не трогают DOM)
// ============================================================

// Сетка календаря: массив недель, неделя — массив из 7 дней (Date) или null.
// Неделя начинается с понедельника. Месяц 0-индексный.
function buildCalendarGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  // День недели для понедельника=0 ... воскресенье=6
  const leadDays = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const weeks = [];
  let week = new Array(leadDays).fill(null);

  for (let day = 1; day <= daysInMonth; day++) {
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

// Сравнение двух дат без учёта времени: -1, 0 или 1
function compareDates(date1, date2) {
  const a = new Date(date1); a.setHours(0, 0, 0, 0);
  const b = new Date(date2); b.setHours(0, 0, 0, 0);
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// Можно ли выбирать день: не раньше «сегодня»
function isDateSelectable(date, todayDate) {
  return compareDates(date, todayDate) >= 0;
}

// Детерминированная «занятость» слота для конкретной даты.
// Зависит только от даты и времени — один и тот же день всегда
// даёт один и тот же набор занятых слотов.
function isSlotBusy(date, minutes) {
  const seed = date.getDate() * 31 + date.getMonth() * 7 +
               date.getFullYear() + minutes;
  return seed % 4 === 0; // каждый четвёртый слот занят
}

// Все слоты дня с пометкой доступности: [{ time:'10:00', minutes, available }]
function getSlotsForDate(date) {
  const slots = [];
  for (let minutes = WORK_START; minutes < WORK_END; minutes += SLOT_STEP) {
    const h = String(Math.floor(minutes / 60)).padStart(2, '0');
    const m = String(minutes % 60).padStart(2, '0');
    slots.push({
      time: h + ':' + m,
      minutes: minutes,
      available: !isSlotBusy(date, minutes)
    });
  }
  return slots;
}

// «Пятница, 6 ноября 2026»
function formatDateLong(date) {
  return DAYS_OF_WEEK[date.getDay()] + ', ' + date.getDate() + ' ' +
         MONTHS_GENITIVE[date.getMonth()] + ' ' + date.getFullYear();
}

// «6 ноября, пт»
function formatDateShort(date) {
  return date.getDate() + ' ' + MONTHS_GENITIVE[date.getMonth()] +
         ', ' + DAYS_OF_WEEK_SHORT[date.getDay()];
}

// ============================================================
// 4. РЕНДЕР (сборка HTML + вставка через innerHTML)
// ============================================================

const calendarGrid = document.getElementById('calendarGrid');
const calendarMonth = document.getElementById('calendarMonth');
const arrowPrev = document.getElementById('arrowPrev');
const arrowNext = document.getElementById('arrowNext');
const slotsTitle = document.getElementById('slotsTitle');
const slotsContainer = document.getElementById('slotsContainer');
const summaryDate = document.getElementById('summaryDate');
const summaryTime = document.getElementById('summaryTime');
const buttonNext = document.getElementById('buttonNext');

function renderCalendar() {
  calendarMonth.textContent =
    MONTHS_NOMINATIVE[state.currentMonth] + ' ' + state.currentYear;

  // Назад нельзя уходить раньше текущего месяца
  const isCurrentMonth =
    state.currentYear === today.getFullYear() &&
    state.currentMonth === today.getMonth();
  arrowPrev.disabled = isCurrentMonth;

  // Шапка с днями недели
  let html = WEEKDAY_HEADERS
    .map(function (name) {
      return '<span class="calendar__weekday">' + name + '</span>';
    })
    .join('');

  // Ячейки дней
  const weeks = buildCalendarGrid(state.currentYear, state.currentMonth);
  weeks.forEach(function (week) {
    week.forEach(function (date) {
      if (!date) {
        html += '<span></span>';
        return;
      }
      const selectable = isDateSelectable(date, today);
      const isSelected = compareDates(date, state.selectedDate) === 0;
      const disabledAttr = selectable ? '' : ' disabled';
      const checkedAttr = (selectable && isSelected) ? ' checked' : '';
      const dayAttr = date.getDate();
      const monthAttr = date.getMonth();
      const yearAttr = date.getFullYear();
      html += '<label class="option">' +
        '<input type="radio" name="day"' + checkedAttr + disabledAttr +
        ' data-day="' + dayAttr + '" data-month="' + monthAttr +
        '" data-year="' + yearAttr + '">' +
        '<span>' + dayAttr + '</span></label>';
    });
  });

  calendarGrid.innerHTML = html;

  // Обработчики вешаем заново: старые ячейки удалены вместе с innerHTML
  calendarGrid.querySelectorAll('input[name="day"]').forEach(function (input) {
    input.addEventListener('change', onDayChange);
  });
}

function renderTimeSlots() {
  slotsTitle.textContent = 'Свободное время на ' + formatDateShort(state.selectedDate);

  const slots = getSlotsForDate(state.selectedDate);

  // Если выбранный слот занят на новом дне — сбрасываем выбор
  const chosen = slots.find(function (slot) { return slot.time === state.selectedTime; });
  if (state.selectedTime && (!chosen || !chosen.available)) {
    state.selectedTime = null;
  }

  let html = '';
  SLOT_GROUPS.forEach(function (group) {
    const groupName = group[0];
    const from = group[1];
    const to = group[2];
    const groupSlots = slots.filter(function (slot) {
      return slot.minutes >= from && slot.minutes < to;
    });
    if (groupSlots.length === 0) return;

    html += '<div class="slots__group">' +
      '<p class="slots__label">' + groupName + '</p>' +
      '<div class="slots__grid">';
    groupSlots.forEach(function (slot) {
      const disabledAttr = slot.available ? '' : ' disabled';
      const checkedAttr = (slot.available && slot.time === state.selectedTime) ? ' checked' : '';
      html += '<label class="option option--slot">' +
        '<input type="radio" name="time" value="' + slot.time + '"' +
        checkedAttr + disabledAttr + '>' +
        '<span>' + slot.time + '</span></label>';
    });
    html += '</div></div>';
  });

  slotsContainer.innerHTML = html;

  // Обработчики — заново, после каждой перерисовки
  slotsContainer.querySelectorAll('input[name="time"]').forEach(function (input) {
    input.addEventListener('change', onTimeSlotChange);
  });
}

// Нижняя панель: день недели, число, месяц, год + выбранное время
function renderSummary() {
  summaryDate.textContent = formatDateLong(state.selectedDate);
  summaryTime.textContent = state.selectedTime || '—';
}

function renderAll() {
  renderCalendar();
  renderTimeSlots();
  renderSummary();
}

// ============================================================
// 5. ОБРАБОТЧИКИ СОБЫТИЙ
// ============================================================

// Клик по дню: обновляем дату, СБРАСЫВАЕМ время, перерисовываем всё
function onDayChange(event) {
  const input = event.currentTarget;
  const date = new Date(
    Number(input.dataset.year),
    Number(input.dataset.month),
    Number(input.dataset.day)
  );
  date.setHours(0, 0, 0, 0);

  if (!isDateSelectable(date, today)) return; // страховка от прошлых дат

  state.selectedDate = date;
  state.selectedTime = null; // важно: не тащим время с прошлого дня
  renderAll();
}

// Клик по слоту: запоминаем время, перерисовываем слоты и панель
function onTimeSlotChange(event) {
  state.selectedTime = event.currentTarget.value;
  renderTimeSlots();
  renderSummary();
}

// Листание месяцев
function shiftMonth(direction) {
  state.currentMonth += direction;
  if (state.currentMonth < 0) {
    state.currentMonth = 11;
    state.currentYear--;
  } else if (state.currentMonth > 11) {
    state.currentMonth = 0;
    state.currentYear++;
  }
  renderCalendar();
}

function onArrowPrevClick() { shiftMonth(-1); }
function onArrowNextClick() { shiftMonth(1); }

// Кнопка «Продолжить»
function onButtonNextClick() {
  if (!state.selectedTime) {
    alert('Сначала выберите время записи.');
    return;
  }
  alert('Запись подтверждена: ' + formatDateLong(state.selectedDate) +
        ' в ' + state.selectedTime + '.');
}

// ============================================================
// 6. ИНИЦИАЛИЗАЦИЯ
// ============================================================

function init() {
  arrowPrev.addEventListener('click', onArrowPrevClick);
  arrowNext.addEventListener('click', onArrowNextClick);
  buttonNext.addEventListener('click', onButtonNextClick);

  // Первый рендер: выбран «сегодня», его слоты на месте
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
