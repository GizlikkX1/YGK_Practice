import { formatDateLong } from '../data/date.js';

export default function BookingSummary({ selectedDay, selectedTime, onContinue }) {
  return (
    <aside className="card summary">
      <h2 className="card__title">Ваша запись</h2>
      <ul className="summary__list">
        <li className="summary__row">
          <span className="summary__key">Услуга</span>
          <span className="summary__value">Мужская стрижка</span>
        </li>
        <li className="summary__row">
          <span className="summary__key">Мастер</span>
          <span className="summary__value">Алексей</span>
        </li>
        <li className="summary__row">
          <span className="summary__key">Дата</span>
          <span className="summary__value" id="summaryDate">{formatDateLong(selectedDay)}</span>
        </li>
        <li className="summary__row">
          <span className="summary__key">Время</span>
          <span className="summary__value" id="summaryTime">{selectedTime || '—'}</span>
        </li>
      </ul>

      <div className="summary__total">
        <span>Итого</span>
        <span>1 800 ₽</span>
      </div>

      <div className="summary__actions">
        <button className="button button--primary" type="button" onClick={onContinue}>
          Продолжить
        </button>
        <a className="button button--secondary" href="#">Назад</a>
      </div>
    </aside>
  );
}
