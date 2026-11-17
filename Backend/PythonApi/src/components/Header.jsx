export default function Header() {
  return (
    <header className="header">
      <div className="container header__inner">
        <a className="header__logo" href="#">Бритва</a>
        <nav className="header__nav" aria-label="Основная навигация">
          <a className="header__link" href="#">Услуги</a>
          <a className="header__link" href="#">Мастера</a>
          <a className="header__link" href="#">Контакты</a>
        </nav>
        <a className="header__phone" href="tel:+79990000000">+7 999 000-00-00</a>
      </div>
    </header>
  );
}
