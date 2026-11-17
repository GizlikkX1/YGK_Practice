import {
  buildCalendarGrid,
  compareDates,
  isDateSelectable,
  MONTHS_NOMINATIVE,
  WEEKDAY_HEADERS,
} from '../data/date.js';

export default function Calendar({
  currentMonth,
  currentYear,
  selectedDay,
  today,
  onSelectDay,
  onMonthChange,
}) {
  const weeks = buildCalendarGrid(currentYear, currentMonth);
  const isCurrentMonth =
    currentYear === today.getFullYear() && currentMonth === today.getMonth();

  return (
    <section className="card calendar" aria-label="Календарь">
      <div className="calendar__head">
        <h2 className="calendar__month" id="calendarMonth">
          {MONTHS_NOMINATIVE[currentMonth]} {currentYear}
        </h2>
        <div className="calendar__arrows">
          <button
            className="calendar__arrow"
            type="button"
            aria-label="Предыдущий месяц"
            disabled={isCurrentMonth}
            onClick={() => onMonthChange(-1)}
          >
            ‹
          </button>
          <button
            className="calendar__arrow"
            type="button"
            aria-label="Следующий месяц"
            onClick={() => onMonthChange(1)}
          >
            ›
          </button>
        </div>
      </div>

      <div className="calendar__grid">
        {WEEKDAY_HEADERS.map((name) => (
          <span className="calendar__weekday" key={name}>{name}</span>
        ))}

        {weeks.map((week, weekIndex) =>
          week.map((date, dayIndex) => {
            if (!date) {
              return <span key={`empty-${weekIndex}-${dayIndex}`} aria-hidden="true" />;
            }

            const selectable = isDateSelectable(
              date.getDate(),
              date.getMonth(),
              date.getFullYear(),
              today,
            );
            const isSelected = compareDates(date, selectedDay) === 0;

            return (
              <label className="option" key={date.toISOString()}>
                <input
                  type="radio"
                  name="day"
                  value={date.getDate()}
                  checked={selectable && isSelected}
                  disabled={!selectable}
                  onChange={() => onSelectDay(date)}
                />
                <span>{date.getDate()}</span>
              </label>
            );
          }),
        )}
      </div>
    </section>
  );
}
