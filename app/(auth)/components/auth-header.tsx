import Link from "next/link";

export function AuthHeader() {
  return (
    <header className="auth-header" role="banner">
      <div className="auth-header__container">
        <Link href="/" className="auth-header__brand">
          <span className="auth-header__brand-dot" aria-hidden="true" />
          Journal.Vet
        </Link>
        <Link href="/" className="auth-header__back">
          <span className="auth-header__back-icon" aria-hidden="true">
            ←
          </span>
          Back to homepage
        </Link>
      </div>
    </header>
  );
}
