export const SLOT_GROUPS = [
  { name: 'Утро', from: 10 * 60, to: 12 * 60 },
  { name: 'День', from: 12 * 60, to: 17 * 60 },
  { name: 'Вечер', from: 17 * 60, to: 21 * 60 },
];

const SLOT_STEP = 30;
const WORK_START = 10 * 60;
const WORK_END = 21 * 60;

function isSlotBusy(date, minutes) {
  const seed = date.getDate() * 31 + date.getMonth() * 7 + date.getFullYear() + minutes;
  return seed % 4 === 0;
}

// Демо-расписание: для каждой даты формируется постоянный набор слотов.
export function getSlotsForDate(date) {
  const slots = [];

  for (let minutes = WORK_START; minutes < WORK_END; minutes += SLOT_STEP) {
    const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mins = String(minutes % 60).padStart(2, '0');

    slots.push({
      time: `${hours}:${mins}`,
      minutes,
      available: !isSlotBusy(date, minutes),
    });
  }

  return slots;
}
