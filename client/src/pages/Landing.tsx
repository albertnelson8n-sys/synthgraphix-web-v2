import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Glass, PrismButton, PrismText, SoftButton } from "../components/ui";

type Slide = {
  title: string;
  subtitle: string;
  metric: string;
  tag: string;
  img: string;
};

function useParallax(rootRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const onScroll = () => {
      const y = window.scrollY || 0;
      el.style.setProperty("--sg-scroll", String(y));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [rootRef]);
}

function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouse = useRef({ x: 0, y: 0, dx: 0, dy: 0 });

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d", { alpha: true });
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;

    const N = 120;
    const pts = Array.from({ length: N }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      p: Math.random() * 0.7 + 0.3,
    }));

    const resize = () => {
      const r = window.devicePixelRatio || 1;
      w = Math.max(1, c.clientWidth);
      h = Math.max(1, c.clientHeight);
      c.width = Math.floor(w * r);
      c.height = Math.floor(h * r);
      ctx.setTransform(r, 0, 0, r, 0, 0);
    };

    const onMove = (e: MouseEvent) => {
      const rect = c.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      mouse.current.dx = x - mouse.current.x;
      mouse.current.dy = y - mouse.current.y;
      mouse.current.x = x;
      mouse.current.y = y;
    };

    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      const mx = mouse.current.x / Math.max(1, w);
      const my = mouse.current.y / Math.max(1, h);

      // soft vignette
      const g = ctx.createRadialGradient(w * 0.5, h * 0.3, 0, w * 0.5, h * 0.45, Math.max(w, h) * 0.75);
      g.addColorStop(0, "rgba(255,255,255,0.06)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // update + draw connections
      for (const p of pts) {
        p.x += p.vx * 0.006;
        p.y += p.vy * 0.006;
        if (p.x < -0.1) p.x = 1.1;
        if (p.x > 1.1) p.x = -0.1;
        if (p.y < -0.1) p.y = 1.1;
        if (p.y > 1.1) p.y = -0.1;
      }

      const px = (u: number) => u * w;
      const py = (u: number) => u * h;

      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i];
          const b = pts[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > 0.006) continue;
          const t = 1 - Math.min(1, d2 / 0.006);
          const shade = 0.10 * t;
          ctx.strokeStyle = `rgba(255,255,255,${shade})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px(a.x), py(a.y));
          ctx.lineTo(px(b.x), py(b.y));
          ctx.stroke();
        }
      }

      // draw nodes (mouse-reactive)
      for (const p of pts) {
        const x = px(p.x);
        const y = py(p.y);
        const mdx = p.x - mx;
        const mdy = p.y - my;
        const md = Math.sqrt(mdx * mdx + mdy * mdy);
        const boost = Math.max(0, 1 - md * 2.2);
        const r = 1.2 + p.p * 2.2 + boost * 2.8;
        ctx.fillStyle = `rgba(255,255,255,${0.25 + boost * 0.28})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(tick);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}

function HeroCarousel({ slides }: { slides: Slide[] }) {
  const [idx, setIdx] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useRef({ down: false, x0: 0, a0: 0, a: 0 });

  useEffect(() => {
    const t = window.setInterval(() => setIdx((i) => (i + 1) % slides.length), 5600);
    return () => window.clearInterval(t);
  }, [slides.length]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      drag.current.down = true;
      drag.current.x0 = e.clientX;
      drag.current.a0 = drag.current.a;
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag.current.down) return;
      const dx = e.clientX - drag.current.x0;
      drag.current.a = drag.current.a0 + dx * 0.08;
      el.style.setProperty("--car-rot", `${drag.current.a}deg`);
    };
    const onUp = () => {
      drag.current.down = false;
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  return (
    <div className="sg-aurora-page">
      <AuroraBackdrop />
      <div className="flex items-center justify-between">
        <div className="text-xs tracking-[0.32em] uppercase text-white/70">Featured Highlights</div>
        <div className="flex gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              className={
                "h-2.5 rounded-full transition-all " +
                (i === idx ? "w-10 bg-white/90" : "w-6 bg-white/20 hover:bg-white/30")
              }
              onClick={() => setIdx(i)}
              type="button"
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      </div>

      <div
        ref={ref}
        className="mt-4 relative select-none rounded-[28px] border border-white/10 overflow-hidden sg-shadow-3d"
        style={{
          backgroundImage:
            `linear-gradient(rgba(0,0,0,0.60), rgba(0,0,0,0.82)), url(${slides[idx].img})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 50% 35%, rgba(255,255,255,0.10), transparent 62%)" }} />

        <div className="relative p-6 sm:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-3 py-1 text-xs text-white/80">
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />
                {slides[idx].tag}
              </div>

              <PrismText as="div" className="mt-4 text-[28px] sm:text-[40px] lg:text-[46px] font-black leading-[1.02] h3d h3d-steel">
                {slides[idx].title}
              </PrismText>
              <div className="mt-3 text-white/75 max-w-[62ch]">{slides[idx].subtitle}</div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <div className="rounded-2xl bg-black/40 border border-white/10 px-4 py-3">
                  <div className="text-xs text-white/60 uppercase tracking-[0.22em]">Live Metric</div>
                  <div className="mt-1 text-white font-extrabold text-lg">{slides[idx].metric}</div>
                </div>

                <div className="rounded-2xl bg-black/40 border border-white/10 px-4 py-3">
                  <div className="text-xs text-white/60 uppercase tracking-[0.22em]">Depth</div>
                  <div className="mt-1 text-white font-extrabold text-lg">Parallax Layers</div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link to="/register" className="inline-block">
                  <PrismButton className="px-6 py-3 w-auto !text-white font-bold">Create Account</PrismButton>
                </Link>
                <Link to="/login" className="inline-block">
                  <SoftButton className="px-6 py-3 !text-white font-bold">Sign In</SoftButton>
                </Link>
              </div>
            </div>

            {/* 3D scene cards */}
            <div className="relative">
              <div
                className="relative h-[320px] sm:h-[360px] rounded-[26px] border border-white/10 bg-black/35 overflow-hidden"
                style={{
                  transform: "perspective(1100px) rotateX(10deg) rotateY(-10deg)",
                  transformStyle: "preserve-3d",
                }}
              >
                <div className="absolute inset-0" style={{ background: "radial-gradient(700px 360px at 30% 35%, rgba(25,243,255,0.22), transparent 55%), radial-gradient(720px 380px at 70% 30%, rgba(244,43,255,0.18), transparent 55%), radial-gradient(900px 520px at 55% 100%, rgba(168,120,255,0.18), transparent 60%)" }} />
                <div
                  className="absolute inset-0"
                  style={{
                    background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.00))",
                    mixBlendMode: "screen",
                  }}
                />

                <div
                  className="absolute left-6 top-8 w-[210px] h-[210px] rounded-[34px]"
                  style={{
                    transform: "translateZ(56px) rotate(-8deg)",
                    background:
                      "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.65), rgba(255,255,255,0.00) 60%)," +
                      "linear-gradient(135deg, rgba(25,243,255,0.75), rgba(244,43,255,0.55), rgba(185,255,108,0.35))",
                    boxShadow: "0 22px 70px rgba(0,0,0,0.55)",
                    border: "1px solid rgba(255,255,255,0.18)",
                  }}
                />

                <div
                  className="absolute right-6 top-14 w-[170px] h-[170px] rounded-[999px]"
                  style={{
                    transform: "translateZ(34px) rotate(18deg)",
                    background:
                      "conic-gradient(from 90deg, rgba(25,243,255,0.80), rgba(244,43,255,0.62), rgba(168,120,255,0.62), rgba(185,255,108,0.44), rgba(25,243,255,0.80))",
                    filter: "blur(0.0px)",
                    border: "1px solid rgba(255,255,255,0.18)",
                    boxShadow: "0 28px 90px rgba(0,0,0,0.55)",
                  }}
                />

                <div
                  className="absolute left-10 bottom-10 right-10 h-[90px] rounded-[22px] bg-[#0b1220]/85 border border-white/15 shadow-[0_18px_55px_rgba(0,0,0,.45)] backdrop-blur"
                  style={{ transform: "translateZ(44px)" }}
                >
                  <div className="p-4">
                    <div className="text-xs uppercase tracking-[0.26em] text-white/65">Interactive Rotation</div>
                    <div className="mt-1 text-white/85 text-sm">Drag anywhere on this panel to rotate the carousel shell.</div>
                  </div>
                </div>

                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
              </div>

              <div className="mt-3 text-xs text-white/60">Tip: Drag to rotate. Scroll to reveal deeper parallax layers.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuroraBackdrop() {
  return (
    <div className="sg-aurora-backdrop" aria-hidden="true">
      <div className="sg-stars" />
      <div className="sg-aurora">
        <div className="sg-aurora-layer sg-aurora-a" />
        <div className="sg-aurora-layer sg-aurora-b" />
        <div className="sg-aurora-layer sg-aurora-c" />
      </div>

      <svg className="sg-landscape" viewBox="0 0 1200 260" preserveAspectRatio="none">
        <defs>
          <linearGradient id="sgSil" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(0,0,0,0.55)" />
            <stop offset="1" stopColor="rgba(0,0,0,0.92)" />
          </linearGradient>
        </defs>
        <path d="M0,210 L90,160 L170,178 L260,138 L340,168 L430,118 L520,156 L610,120 L700,150 L790,110 L880,150 L990,120 L1110,160 L1200,130 L1200,260 L0,260 Z" fill="url(#sgSil)" />
        <path d="M0,230 L120,190 L220,205 L330,180 L450,205 L570,175 L700,210 L820,180 L960,215 L1100,190 L1200,210 L1200,260 L0,260 Z" fill="rgba(0,0,0,0.88)" />
      </svg>

      <div className="sg-bottom-fog" />
    </div>
  );
}

export default function Landing() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  useParallax(rootRef);

  const slides: Slide[] = useMemo(
    () => [
      {
        tag: "Crystal Growth",
        title: "Maximalist 3D Business Control Room",
        subtitle:
          "A tactile, architectural interface for tasks, revenue, and operations—built as a machine inside the screen.",
        metric: "10 tasks/day",
        img: "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1800&q=80",
      },
      {
        tag: "Floating Gears",
        title: "Workflow Orchestration With Depth",
        subtitle:
          "Parallax layers, volumetric text, and glass surfaces unify product, people, and payouts into one system.",
        metric: "Activation + Withdrawals",
        img: "https://images.unsplash.com/photo-1553877522-43269d4ea984?auto=format&fit=crop&w=1800&q=80",
      },
      {
        tag: "Glowing Data Nodes",
        title: "Analytics That Feel Physical",
        subtitle:
          "Every metric reads as a 3D object—beveled, reflective, and illuminated by prism highlights.",
        metric: "Live snapshots",
        img: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1800&q=80",
      },
    ],
    []
  );

  const tiers = [
    {
      name: "Starter",
      price: "Free",
      desc: "Explore tasks, history, and dashboards.",
      points: ["Daily task queue", "Referrals & bonus wallet", "Export history"],
    },
    {
      name: "Growth",
      price: "KES 0",
      desc: "Unlock withdrawals with a one-time activation fee.",
      points: ["Activation fee: KES 100", "Withdrawal request processing", "Priority support forms"],
      highlight: true,
    },
    {
      name: "Enterprise",
      price: "Custom",
      desc: "Branding, teams, and reporting.",
      points: ["Multi-seat roles", "Audit logs", "Custom task catalogs"],
    },
  ];

  const faqs = [
    {
      q: "How do earnings work?",
      a: "Complete assigned tasks to earn KES into your balance. Task value varies by complexity and category.",
    },
    {
      q: "Why is there an activation fee for withdrawals?",
      a: "To reduce abuse and keep payouts reliable, a one-time KES 100 activation is required before withdrawals are processed. You can pay it after you have earned at least KES 100.",
    },
    {
      q: "What task types are available?",
      a: "A large catalog: surveys (micro/long), data entry, transcription, image captioning, QA, bug reports, content moderation, customer support, and more.",
    },
    {
      q: "Can I use this on mobile?",
      a: "Yes. The default mobile experience shows the full desktop layout compressed to fit, so the UI stays rich and consistent.",
    },
  ];

  return (
    <div ref={rootRef} className="sg-prism-bg min-h-screen overflow-x-hidden">
      {/* deep background */}
      <div className="sg-layer sg-layer-0" aria-hidden="true" />
      <div className="sg-layer sg-layer-1" aria-hidden="true" />
      <div className="sg-layer sg-layer-2" aria-hidden="true" />
      <div className="sg-layer sg-layer-3" aria-hidden="true" />

      {/* particles */}
      <div className="pointer-events-none fixed inset-0 opacity-50">
        <ParticleField />
      </div>

      {/* top nav */}
      <div className="sticky top-0 z-40">
        <div className="backdrop-blur-2xl border-b border-white/10" style={{ background: "rgba(7,7,13,0.52)" }}>
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center">
                <div className="h-7 w-7 rounded-xl sg-prism-grad" />
              </div>
              <div className="leading-tight">
                <div className="font-black tracking-wide">SYNTHGRAPHIX</div>
                <div className="text-xs text-white/60 tracking-[0.22em] uppercase">Synthgraphix Platform</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/login">
                <SoftButton className="px-5 py-2 !text-white font-bold">Sign In</SoftButton>
              </Link>
              <Link to="/register">
                <PrismButton className="px-5 py-2 w-auto !text-white font-bold">Get Started</PrismButton>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pt-10 pb-24">
        {/* hero */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-3 py-1 text-xs text-white/75">
              <span className="h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />
              High-fidelity 3D UI, parallax layers, live task economy
            </div>

            <PrismText as="h1" className="mt-4 text-[44px] sm:text-[56px] lg:text-[64px] font-black leading-[0.98] h3d h3d-neon">
              Build revenue through tasks in a prism-lit control room.
            </PrismText>

            <div className="mt-4 text-white/75 max-w-[58ch]">
              SynthGraphix is a futuristic business platform that blends an earning workflow with operational dashboards, history, support,
              and an activation-gated withdrawal pipeline.
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/register" className="inline-block">
                <PrismButton className="px-6 py-3 w-auto !text-white font-bold">Create Your Workspace</PrismButton>
              </Link>
              <Link to="/login" className="inline-block">
                <SoftButton className="px-6 py-3 !text-white font-bold">Open Console</SoftButton>
              </Link>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-4">
              {["Max 10 tasks/day", "Surveys + micro-work", "3D dashboard UX", "Activation-gated withdrawals"].map((t) => (
                <div key={t} className="rounded-2xl bg-[#0b1220]/85 border border-white/15 shadow-[0_18px_55px_rgba(0,0,0,.45)] backdrop-blur px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.26em] text-white/75 font-bold">Capability</div>
                  <div className="mt-1 text-white font-bold">{t}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7">
            <HeroCarousel slides={slides} />
          </div>
        </div>

        {/* architecture strip */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              title: "Task Engine",
              desc: "Large catalog across surveys, QA, transcription, ops, and support flows.",
            },
            {
              title: "Analytics Plane",
              desc: "Operational snapshots: productivity, completions, streaks, and earnings trends.",
            },
            {
              title: "Payout Gate",
              desc: "One-time activation fee (KES 100) paid after earning, then withdrawals can be processed.",
            },
          ].map((c) => (
            <div key={c.title} className="sg-panel rounded-3xl p-6 sg-hover-tilt">
              <PrismText as="div" className="text-2xl font-black">
                {c.title}
              </PrismText>
              <div className="mt-2 text-white/70">{c.desc}</div>
            </div>
          ))}
        </div>

        {/* workflow */}
        <div className="mt-16">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs tracking-[0.32em] uppercase text-white/65">Workflow</div>
              <PrismText as="h2" className="mt-2 text-[34px] sm:text-[42px] font-black h3d h3d-gold">
                A complete path from tasks to payouts.
              </PrismText>
            </div>
            <div className="text-white/65 max-w-[52ch]">
              The experience is intentionally rich: layered visuals, tactile components, and a clear economy loop.
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-5">
            {[
              {
                step: "01",
                title: "Complete Tasks",
                desc: "Receive up to 10 tasks per day. Earn KES per completion, tracked in history.",
              },
              {
                step: "02",
                title: "Unlock Withdrawals",
                desc: "After earning at least KES 100, pay a one-time KES 100 activation externally via Pesapal to unlock withdrawals.",
              },
              {
                step: "03",
                title: "Request Payout",
                desc: "Submit withdrawal requests to mobile money and track status updates in your console.",
              },
            ].map((s) => (
              <div key={s.step} className="sg-panel rounded-3xl p-6 bg-[#0b1220]/85 border border-white/15 shadow-[0_18px_55px_rgba(0,0,0,.45)] backdrop-blur">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl px-3 py-1 bg-white/10 border border-white/10 text-xs tracking-[0.28em] uppercase">{s.step}</div>
                  <div className="h-px flex-1 bg-white/10" />
                </div>
                <PrismText as="div" className="mt-4 text-2xl font-black">
                  {s.title}
                </PrismText>
                <div className="mt-2 text-white/70">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* use cases */}
        <div className="mt-16">
          <div className="text-xs tracking-[0.32em] uppercase text-white/65">Use Cases</div>
          <PrismText as="h2" className="mt-2 text-[34px] sm:text-[42px] font-black h3d h3d-steel">
            Built for modern micro-work & ops.
          </PrismText>

          <div className="mt-7 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              ["Surveys", "Micro + long-form surveys to drive consistent earnings."],
              ["Transcription", "Audio/video transcription with media previews."],
              ["Image Understanding", "Captioning, tagging, and moderation flows."],
              ["QA & Testing", "UI testing prompts and structured bug reports."],
              ["Operations", "Document checks, lead enrichment, and pricing audits."],
              ["Support", "Customer chat, email triage, and knowledge base tasks."],
            ].map(([t, d]) => (
              <div key={t} className="sg-panel rounded-3xl p-6 bg-[#0b1220]/85 border border-white/15 shadow-[0_18px_55px_rgba(0,0,0,.45)] backdrop-blur">
                <PrismText as="div" className="text-xl font-black">
                  {t}
                </PrismText>
                <div className="mt-2 text-white/70">{d}</div>
              </div>
            ))}
          </div>
        </div>

        {/* pricing */}
        <div className="mt-18">
          <div className="mt-16 flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs tracking-[0.32em] uppercase text-white/65">Pricing</div>
              <PrismText as="h2" className="mt-2 text-[34px] sm:text-[42px] font-black h3d h3d-neon">
                Simple tiers, clear payout rules.
              </PrismText>
            </div>
            <div className="text-white/65 max-w-[52ch]">Start free. Pay activation only when you have earned enough to withdraw.</div>
          </div>

          <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-5">
            {tiers.map((t) => (
              <div
                key={t.name}
                className={
                  "rounded-3xl p-6 bg-[#0b1220]/85 border shadow-[0_18px_55px_rgba(0,0,0,.45)] backdrop-blur " + (t.highlight ? "border-[rgba(241,210,138,0.55)] bg-[rgba(241,210,138,0.10)] shadow-[0_25px_90px_rgba(0,0,0,0.55)]" : "border-white/15")
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <PrismText as="div" className="text-2xl font-black">
                      {t.name}
                    </PrismText>
                    <div className="mt-1 text-white/65">{t.desc}</div>
                  </div>
                  {t.highlight && (
                    <div className="rounded-full bg-white/10 border border-white/10 px-3 py-1 text-xs tracking-[0.26em] uppercase text-white/75">Recommended</div>
                  )}
                </div>

                <div className="mt-5">
                  <div className="text-3xl font-black text-white">{t.price}</div>
                </div>

                <div className="mt-5 space-y-2">
                  {t.points.map((p) => (
                    <div key={p} className="flex items-start gap-2 text-white/75">
                      <span className="mt-1 h-2 w-2 rounded-full sg-prism-grad" />
                      <span>{p}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-6">
                  {t.highlight ? (
                    <Link to="/register">
                      <PrismButton className="py-3 !text-white font-bold">Start Growth</PrismButton>
                    </Link>
                  ) : (
                    <Link to="/register">
                      <Button className="py-3 !text-white font-bold">Create Account</Button>
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* faq */}
        <div className="mt-16">
          <div className="text-xs tracking-[0.32em] uppercase text-white/65">FAQ</div>
          <PrismText as="h2" className="mt-2 text-[34px] sm:text-[42px] font-black h3d h3d-gold">
            Answers, upfront.
          </PrismText>

          <div className="mt-7 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {faqs.map((f) => (
              <div key={f.q} className="sg-panel rounded-3xl p-6 bg-[#0b1220]/85 border border-white/15 shadow-[0_18px_55px_rgba(0,0,0,.45)] backdrop-blur">
                <div className="text-white font-bold">{f.q}</div>
                <div className="mt-2 text-white/70">{f.a}</div>
              </div>
            ))}
          </div>
        </div>

        {/* footer */}
        <div className="mt-18 pt-16 border-t border-white/10">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center">
                  <div className="h-7 w-7 rounded-xl sg-prism-grad" />
                </div>
                <div>
                  <div className="font-black tracking-wide">SYNTHGRAPHIX</div>
                  <div className="text-xs text-white/60 tracking-[0.22em] uppercase">Synthgraphix Platform</div>
                </div>
              </div>
              <div className="mt-3 text-white/65 max-w-[70ch]">
                A high-fidelity, maximalist interface for task-driven earnings. Designed to feel tactile, deep, and architecturally complex.
              </div>
            </div>

            <div>
              <div className="text-xs tracking-[0.32em] uppercase text-white/65">Product</div>
              <div className="mt-3 space-y-2 text-white/70">
                <div>Tasks Center</div>
                <div>Analytics</div>
                <div>History</div>
                <div>Payouts</div>
              </div>
            </div>

            <div>
              <div className="text-xs tracking-[0.32em] uppercase text-white/65">Company</div>
              <div className="mt-3 space-y-2 text-white/70">
                <div>Support</div>
                <div>Security</div>
                <div>Terms</div>
                <div>Privacy</div>
              </div>
            </div>
          </div>

          <div className="mt-10 text-xs text-white/55">© {new Date().getFullYear()} SynthGraphix. All rights reserved.</div>
        </div>
      </div>
    </div>
  );
}
