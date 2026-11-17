import { useState } from 'react';
import Header from './components/Header.jsx';
import Steps from './components/Steps.jsx';
import Calendar from './components/Calendar.jsx';
import TimeSlots from './components/TimeSlots.jsx';
import BookingSummary from './components/BookingSummary.jsx';
import Footer from './components/Footer.jsx';
import { getSlotsForDate } from './data/slots.js';
import './styles/site.css';

function getToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export default function App() {
  const [today] = useState(getToday);
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDay, setSelectedDay] = useState(today);
  const [selectedTime, setSelectedTime] = useState(null);
  const [slots, setSlots] = useState(() => getSlotsForDate(today));

  function handleDayClick(date) {
    const nextDate = new Date(date);
    nextDate.setHours(0, 0, 0, 0);

    setSelectedDay(nextDate);
    setSelectedTime(null);
    setSlots(getSlotsForDate(nextDate));
    setCurrentMonth(nextDate.getMonth());
    setCurrentYear(nextDate.getFullYear());
  }

  function handleTimeClick(time) {
    setSelectedTime(time);
  }

  function handleMonthChange(direction) {
    const nextMonth = new Date(currentYear, currentMonth + direction, 1);
    setCurrentMonth(nextMonth.getMonth());
    setCurrentYear(nextMonth.getFullYear());
  }

  function handleContinue() {
    if (!selectedTime) {
      window.alert('Сначала выберите время записи.');
      return;
    }

    window.alert(`Запись подтверждена: ${selectedDay.toLocaleDateString('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })} в ${selectedTime}.`);
  }

  return (
    <>
      <Header />

      <main className="main">
        <div className="container">
          <Steps />
          <h1 className="page-title">Выберите дату и время</h1>

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
                onSelectTime={handleTimeClick}
              />
            </div>

            <BookingSummary
              selectedDay={selectedDay}
              selectedTime={selectedTime}
              onContinue={handleContinue}
            />
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
