import { Card, SoftButton } from "../../components/ui";

export default function Settings() {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-2xl font-extrabold">Settings</div>
        <div className="sg-muted mt-1">
          Account utilities and local testing tools. The platform uses a single classic theme (no multi-color toggle).
        </div>
      </div>

      <Card className="p-4">
        <div className="font-extrabold">Appearance</div>
        <div className="sg-muted text-sm mt-1">
          This build is intentionally <b>dark-only</b> for consistent visual quality across devices.
        </div>

        <div className="mt-4 rounded-2xl bg-white/5 border border-white/10 p-4">
          <div className="font-semibold">Mobile/Desktop Rendering</div>
          <div className="sg-muted text-sm mt-1">
            The site forces a desktop layout on mobile by setting the viewport width to <b>1200</b>,
            which keeps the UI stable without sideways scrolling at normal zoom.
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="font-extrabold">Local Tools</div>
        <div className="sg-muted text-sm mt-1">Convenience actions for testing (client-side only).</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <SoftButton onClick={() => localStorage.removeItem("token")}>Clear token (log out)</SoftButton>
          <SoftButton onClick={() => window.location.reload()}>Reload</SoftButton>
        </div>
      </Card>
    </div>
  );
}
