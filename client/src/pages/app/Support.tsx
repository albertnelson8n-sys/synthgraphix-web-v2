import { useMemo, useState } from "react";
import { Button, Card, Input, SoftButton } from "../../components/ui";

type Ticket = {
  subject: string;
  message: string;
  category: string;
  created_at: string;
};

export default function Support() {
  const faqs = useMemo(
    () => [
      {
        q: "How many tasks can I do per day?",
        a: "The platform assigns up to 10 daily tasks per user per Nairobi day key (configurable by admin). Completing tasks credits your balance immediately.",
      },
      {
        q: "Why is my withdrawal marked as pending?",
        a: "Withdrawals are stored as pending by default in this demo. A real system would process payouts asynchronously and update status.",
      },
      {
        q: "Can I redeem referral bonus?",
        a: "Referral bonus accumulates in a bonus wallet. Once it reaches KSH 1000 you can redeem into your main balance from the Account page.",
      },
      {
        q: "My mobile view looks like desktop — is that intentional?",
        a: "Yes. The site forces a desktop layout on mobile by setting the viewport width to 1200 so mobile browsers scale the desktop UI at 100% zoom.",
      },
    ],
    []
  );

  const [category, setCategory] = useState("account");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState<Ticket[]>([]);

  function submit() {
    if (subject.trim().length < 3 || message.trim().length < 10) return;
    setSent((s) => [
      {
        category,
        subject: subject.trim(),
        message: message.trim(),
        created_at: new Date().toISOString(),
      },
      ...s,
    ]);
    setSubject("");
    setMessage("");
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-2xl font-extrabold">Support</div>
        <div className="sg-muted mt-1">FAQ + ticket form UI to make the platform feel production-ready.</div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-extrabold">WhatsApp Live Support</div>
            <div className="sg-muted text-sm mt-1">Fastest way to reach us for activation, withdrawals, and account issues.</div>
          </div>
          <a
            href="https://wa.me/14506003193?text=Hello%2C%20I%20need%20help%20with%20my%20SynthGraphix%20account."
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2.5 rounded-xl bg-[color:var(--accent)] text-black font-extrabold border border-white/10 hover:brightness-110"
          >
            Chat on WhatsApp
          </a>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="font-extrabold">FAQ</div>
          <div className="sg-muted text-sm mt-1">Common questions and quick resolutions.</div>

          <div className="mt-4 space-y-3">
            {faqs.map((f) => (
              <div key={f.q} className="rounded-2xl bg-black/20 border border-white/10 p-4">
                <div className="font-semibold">{f.q}</div>
                <div className="sg-muted text-sm mt-2">{f.a}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="font-extrabold">Create a Ticket</div>
          <div className="sg-muted text-sm mt-1">In a real deployment, this would POST to a support service.</div>

          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <div className="text-xs sg-muted mb-1">Category</div>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl bg-black/25 border border-white/10 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent)]/15"
                >
                  <option value="account">Account</option>
                  <option value="tasks">Tasks</option>
                  <option value="withdrawals">Withdrawals</option>
                  <option value="referrals">Referrals</option>
                  <option value="technical">Technical</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <div className="text-xs sg-muted mb-1">Subject</div>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary" />
              </div>
            </div>

            <div>
              <div className="text-xs sg-muted mb-1">Message</div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe the issue in detail…"
                className="w-full min-h-[160px] rounded-2xl bg-black/25 border border-white/10 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent)]/15"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={submit}
                disabled={subject.trim().length < 3 || message.trim().length < 10}
                className="sm:w-auto"
              >
                Submit Ticket
              </Button>
              <SoftButton onClick={() => { setSubject(""); setMessage(""); }}>
                Clear
              </SoftButton>
            </div>
          </div>

          <div className="mt-6">
            <div className="font-extrabold">Recent Tickets</div>
            <div className="sg-muted text-sm mt-1">Stored locally in this demo.</div>

            <div className="mt-3 space-y-2">
              {sent.length === 0 ? (
                <div className="sg-muted">No tickets created yet.</div>
              ) : (
                sent.slice(0, 6).map((t, i) => (
                  <div key={i} className="rounded-2xl bg-black/20 border border-white/10 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold">{t.subject}</div>
                      <div className="text-xs sg-muted">{t.category}</div>
                    </div>
                    <div className="sg-muted text-sm mt-2 line-clamp-3">{t.message}</div>
                    <div className="text-xs sg-muted mt-2">{t.created_at}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
