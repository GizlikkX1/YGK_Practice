const steps = [
  { number: 1, title: 'Услуга', status: 'done' },
  { number: 2, title: 'Мастер', status: 'done' },
  { number: 3, title: 'Дата и время', status: 'active' },
  { number: 4, title: 'Подтверждение', status: '' },
];

export default function Steps() {
  return (
    <ol className="steps" aria-label="Этапы записи">
      {steps.map((step) => (
        <li
          className={`steps__item${step.status ? ` steps__item--${step.status}` : ''}`}
          key={step.number}
          aria-current={step.status === 'active' ? 'step' : undefined}
        >
          <span className="steps__num">{step.number}</span>
          <span className="steps__text">{step.title}</span>
        </li>
      ))}
    </ol>
  );
}
