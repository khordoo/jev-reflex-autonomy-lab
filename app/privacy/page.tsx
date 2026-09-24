import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Notice — Jev Reflex Autonomy Lab',
  description: 'How the Jev Reflex Autonomy Lab handles provider keys and mission data.',
};

export default function PrivacyPage() {
  return (
    <main className="policy-page">
      <Link className="policy-back" href="/">← Back to the lab</Link>
      <article>
        <h1>Privacy Notice</h1>
        <p className="policy-updated">Last updated September 23, 2026</p>
        <p>
          Jev Reflex Autonomy Lab is an experimental simulation. You can run its
          local controller without entering an API key. Live mode uses keys you
          choose to provide for OpenRouter or TypeSafe.
        </p>

        <h2>Provider keys</h2>
        <p>
          When you save a key, our server encrypts it and sends the encrypted
          value back in an HttpOnly cookie stored by your browser. The app does
          not keep a separate key database. The cookie expires after one hour,
          or seven days if you select that option. The server decrypts the key
          when you make a live provider request; your provider receives it to
          authenticate that request. Remove saved keys in Settings to clear the
          browser cookie. To invalidate a key everywhere, revoke it with its
          provider.
        </p>

        <h2>Simulation data</h2>
        <p>
          Local mode runs without provider calls. In live mode, the app sends
          mission observations and decision or planning context through its
          server to OpenRouter or TypeSafe, as applicable. Those providers
          handle the requests under their own policies. Mission telemetry is
          displayed in your browser; exporting it creates a file on your device.
        </p>

        <h2>Hosting and logs</h2>
        <p>
          The site host processes web requests and may retain standard request
          metadata and diagnostic logs under its own policies. This app does
          not store provider keys in an application database. Avoid putting
          personal or confidential information into mission inputs or exports.
        </p>

        <h2>Web analytics</h2>
        <p>
          The hosted site uses Vercel Web Analytics to measure page views and
          basic visit statistics, such as page, referrer, device type, and
          approximate location. Vercel says this product uses aggregated data
          and does not use analytics cookies. We do not send provider keys or
          mission exports as analytics events. See{' '}
          <a href="https://vercel.com/docs/analytics/privacy-policy">Vercel’s Web Analytics privacy information</a>.
        </p>

        <h2>Questions</h2>
        <p>
          For privacy questions, contact{' '}
          <a href="mailto:m.khordoo@gmail.com">m.khordoo@gmail.com</a>.
        </p>
        <p>
          Also see the <Link href="/terms">Terms of Use</Link>.
        </p>
      </article>
    </main>
  );
}
