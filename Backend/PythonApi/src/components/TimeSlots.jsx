import { SLOT_GROUPS } from '../data/slots.js';
import { formatDateShort } from '../data/date.js';

function getMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export default function TimeSlots({
  selectedDay,
  slots,
  selectedTime,
  onSelectTime,
  loading,
  error,
  onRetry,
}) {
  return (
    <section className="card slots">
      <h2 className="card__title" id="slotsTitle">
        Свободное время на {formatDateShort(selectedDay)}
      </h2>

      {loading ? (
        <p className="async-state" role="status">Загрузка слотов…</p>
      ) : error ? (
        <div className="async-state async-state--error" role="alert">
          <p>{error}</p>
          <button className="button button--secondary retry-button" type="button" onClick={onRetry}>
            Повторить загрузку
          </button>
        </div>
      ) : slots.length === 0 ? (
        <p className="slots__empty">На эту дату свободных слотов нет.</p>
      ) : (
        <div id="slotsContainer">
          {SLOT_GROUPS.map((group) => {
            const groupSlots = slots.filter((slot) => {
              const minutes = getMinutes(slot.time);
              return minutes >= group.from && minutes < group.to;
            });

            if (groupSlots.length === 0) return null;

            return (
              <div className="slots__group" key={group.name}>
                <p className="slots__label">{group.name}</p>
                <div className="slots__grid">
                  {groupSlots.map((slot) => (
                    <label className="option option--slot" key={slot.time}>
                      <input
                        type="radio"
                        name="time"
                        value={slot.time}
                        checked={slot.available && selectedTime === slot.time}
                        disabled={!slot.available}
                        onChange={() => onSelectTime(slot.time)}
                      />
                      <span>{slot.time}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="slots__legend">
        <span className="slots__legend-item">Свободно</span>
        <span className="slots__legend-item slots__legend-item--busy">Занято</span>
        <span className="slots__legend-item slots__legend-item--picked">Выбрано</span>
      </div>
    </section>
  );
}
