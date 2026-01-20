import React from "react";

export function PrismText({
  children,
  as = "span",
  className = "",
}: {
  children: React.ReactNode;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
}) {
  const Tag: any = as;
  const text = typeof children === "string" ? children : undefined;
  return (
    <Tag
      className={"sg-3d-title " + className}
      {...(text ? { "data-text": text } : {})}
    >
      {children}
    </Tag>
  );
}

export function Glass({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={"rounded-3xl sg-panel backdrop-blur-2xl sg-shadow-3d " + className}>{children}</div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-[14px] text-white placeholder:text-white/35 " +
        "outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20 focus:border-[color:var(--accent)]/55 " +
        (props.className || "")
      }
    />
  );
}

export function Button({
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={
        "w-full rounded-xl bg-[color:var(--accent)] hover:brightness-110 text-black border border-white/10 px-4 py-3 font-semibold transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed " +
        className
      }
    >
      {children}
    </button>
  );
}

export function PrismButton({
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={
        "w-full rounded-xl text-black border border-white/10 px-4 py-3 font-extrabold transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed " +
        "bg-[var(--accentGrad)] hover:brightness-110 shadow-[0_22px_70px_rgba(0,0,0,0.45)] " +
        className
      }
    >
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={"rounded-2xl sg-panel shadow-[0_18px_70px_rgba(0,0,0,0.35)] " + className}>{children}</div>;
}

export function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-3 py-1 text-xs bg-black/35 text-white/85 border border-white/10 " +
        className
      }
    >
      {children}
    </span>
  );
}

export function SoftButton({
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={
        "rounded-xl px-4 py-2 text-sm font-semibold bg-white/5 hover:bg-white/10 text-white border border-white/10 " +
        className
      }
    >
      {children}
    </button>
  );
}
