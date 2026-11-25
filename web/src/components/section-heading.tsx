import type { ReactNode } from "react";

export function SectionHeading({ number, kicker, title, subtitle }: {
  number: string;
  kicker: string;
  title: string;
  subtitle?: ReactNode;
}) {
  return (
    <header className="hd">
      <span className="no" aria-hidden="true">{number}</span>
      <div>
        <p className="kick">{kicker}</p>
        <h2>{title}</h2>
        {subtitle && <p className="sub">{subtitle}</p>}
      </div>
    </header>
  );
}
