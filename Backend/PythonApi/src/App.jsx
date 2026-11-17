import { useEffect, useState } from 'react';
import Header from './components/Header.jsx';
import Steps from './components/Steps.jsx';
import Calendar from './components/Calendar.jsx';
import TimeSlots from './components/TimeSlots.jsx';
import BookingSummary from './components/BookingSummary.jsx';
import Footer from './components/Footer.jsx';
import { fetchSlots, fetchToday } from './api.js';
import { formatDateLong } from './data/date.js';
import './styles/site.css';

const searchParams = new URLSearchParams(window.location.search);
const SIMULATE_TODAY_ERROR = searchParams.get('simulateTodayError') === '1';
const SIMULATE_SLOTS_ERROR = searchParams.get('simulateSlotsError') === '1';

function getDateKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function isResponseForDate(responseDate, selectedDate) {
  return responseDate.day === selectedDate.getDate() &&
    responseDate.month === selectedDate.getMonth() &&
    responseDate.year === selectedDate.getFullYear();
}

export default function App() {
  const [today, setToday] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(null);
  const [currentYear, setCurrentYear] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [slots, setSlots] = useState([]);

  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState(null);
  const [todayRetryKey, setTodayRetryKey] = useState(0);
  const [slotsRetryKey, setSlotsRetryKey] = useState(0);

  // Получаем текущую дату с сервера при открытии страницы.
  useEffect(() => {
    const controller = new AbortController();
    let isActive = true;

    async function loadToday() {
      setPageLoading(true);
      setPageError(null);
      try {
        const serverToday = await fetchToday({
          signal: controller.signal,
          simulateError: SIMULATE_TODAY_ERROR,
        });
        if (!isActive) return;

        const date = new Date(serverToday.year, serverToday.month, serverToday.day);
        date.setHours(0, 0, 0, 0);
        setToday(date);
        setSelectedDay(date);
        setCurrentMonth(date.getMonth());
        setCurrentYear(date.getFullYear());
      } catch (error) {
        if (isActive && error.name !== 'AbortError') {
          setPageError(error.message || 'Не удалось загрузить дату.');
        }
      } finally {
        if (isActive) setPageLoading(false);
      }
    }

    loadToday();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [todayRetryKey]);

  // При первом выборе даты и при каждом её изменении загружаем слоты.
  // Cleanup + AbortController защищают интерфейс от запоздавших ответов.
  useEffect(() => {
    if (!selectedDay) return undefined;

    const controller = new AbortController();
    let isActive = true;
    const requestedDateKey = getDateKey(selectedDay);

    async function loadSlots() {
      setSlotsLoading(true);
      setSlotsError(null);
      setSlots([]);

      try {
        const response = await fetchSlots(selectedDay, {
          signal: controller.signal,
          simulateError: SIMULATE_SLOTS_ERROR,
        });
        if (!isActive || getDateKey(selectedDay) !== requestedDateKey) return;

        // Дополнительная проверка даты в ответе: не принимаем чужой/устаревший ответ.
        if (!isResponseForDate(response.date, selectedDay)) {
          throw new Error('Сервер вернул расписание для другой даты. Повторите запрос.');
        }

        setSlots(response.slots);
        setSelectedTime((currentTime) => (
          response.slots.some((slot) => slot.time === currentTime && slot.available)
            ? currentTime
            : null
        ));
      } catch (error) {
        if (isActive && error.name !== 'AbortError') {
          setSlotsError(error.message || 'Не удалось загрузить свободное время.');
        }
      } finally {
        if (isActive) setSlotsLoading(false);
      }
    }

    loadSlots();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [selectedDay, slotsRetryKey]);

  function handleDayClick(date) {
    const nextDate = new Date(date);
    nextDate.setHours(0, 0, 0, 0);
    if (today && nextDate < today) return;

    setSelectedDay(nextDate);
    setSelectedTime(null);
    setSlots([]);
    setSlotsLoading(true);
    setSlotsError(null);
    setCurrentMonth(nextDate.getMonth());
    setCurrentYear(nextDate.getFullYear());
  }

  function handleMonthChange(direction) {
    if (currentMonth === null || currentYear === null) return;

    const nextMonth = new Date(currentYear, currentMonth + direction, 1);
    if (today && nextMonth < new Date(today.getFullYear(), today.getMonth(), 1)) return;

    setCurrentMonth(nextMonth.getMonth());
    setCurrentYear(nextMonth.getFullYear());
  }

  function handleContinue() {
    if (!selectedTime) {
      window.alert('Сначала выберите время записи.');
      return;
    }

    window.alert(`Запись подтверждена: ${formatDateLong(selectedDay)} в ${selectedTime}.`);
  }

  return (
    <>
      <Header />
      <main className="main">
        <div className="container">
          <Steps />
          <h1 className="page-title">Выберите дату и время</h1>

          {pageLoading ? (
            <p className="async-state page-async-state" role="status">Загрузка…</p>
          ) : pageError ? (
            <div className="async-state async-state--error page-async-state" role="alert">
              <p>{pageError}</p>
              <button
                className="button button--secondary retry-button"
                type="button"
                onClick={() => setTodayRetryKey((key) => key + 1)}
              >
                Повторить загрузку
              </button>
            </div>
          ) : selectedDay && today ? (
            <div className="booking">
              <div className="booking__content">
                <Calendar
                  currentMonth={currentMonth}
                  currentYear={currentYear}
                  selectedDay={selectedDay}
                  today={today}
                  onSelectDay={handleDayClick}
                  onMonthChange={handleMonthChange}
                />
                <TimeSlots
                  selectedDay={selectedDay}
                  slots={slots}
                  selectedTime={selectedTime}
                  onSelectTime={setSelectedTime}
                  loading={slotsLoading}
                  error={slotsError}
                  onRetry={() => setSlotsRetryKey((key) => key + 1)}
                />
              </div>
              <BookingSummary
                selectedDay={selectedDay}
                selectedTime={selectedTime}
                onContinue={handleContinue}
              />
            </div>
          ) : null}
        </div>
      </main>
      <Footer />
    </>
  );
}
