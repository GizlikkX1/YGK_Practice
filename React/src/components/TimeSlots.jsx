import { SLOT_GROUPS } from '../data/slots.js';
import { formatDateShort } from '../data/date.js';

export default function TimeSlots({ selectedDay, slots, selectedTime, onSelectTime }) {
  return (
    <section className="card slots">
      <h2 className="card__title" id="slotsTitle">
        Свободное время на {formatDateShort(selectedDay)}
      </h2>

      <div id="slotsContainer">
        {SLOT_GROUPS.map((group) => {
          const groupSlots = slots.filter(
            (slot) => slot.minutes >= group.from && slot.minutes < group.to,
          );

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

      <div className="slots__legend">
        <span className="slots__legend-item">Свободно</span>
        <span className="slots__legend-item slots__legend-item--busy">Занято</span>
        <span className="slots__legend-item slots__legend-item--picked">Выбрано</span>
      </div>
    </section>
  );
}
