import React from "react";

export default function WhatsAppFloat({
  phone = "+14506003193",
  message = "Hello, I need help with my SynthGraphix account.",
}: {
  phone?: string;
  message?: string;
}) {
  const digits = phone.replace(/[^0-9]/g, "");
  const href = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="fixed z-50 bottom-5 right-5"
      aria-label="WhatsApp Support"
    >
      <div className="group rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-4 py-3 shadow-[0_22px_70px_rgba(0,0,0,0.55)] hover:bg-white/10 transition">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[color:var(--accent)] text-black flex items-center justify-center font-black">
            W
          </div>
          <div className="leading-tight">
            <div className="text-white font-extrabold text-sm">WhatsApp Support</div>
            <div className="text-white/60 text-xs group-hover:text-white/70">Chat with us</div>
          </div>
        </div>
      </div>
    </a>
  );
}
