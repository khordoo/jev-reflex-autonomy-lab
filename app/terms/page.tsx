import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Use — Jev Reflex Autonomy Lab',
  description: 'Terms for using the hosted Jev Reflex Autonomy Lab demonstration.',
};

export default function TermsPage() {
  return (
    <main className="policy-page">
      <Link className="policy-back" href="/">← Back to the lab</Link>
      <article>
        <h1>Terms of Use</h1>
        <p className="policy-updated">Last updated September 23, 2026</p>
        <p>
          These terms apply to the hosted Jev Reflex Autonomy Lab demonstration.
          The project&apos;s source code is licensed separately under the MIT
          license.
        </p>

        <h2>Experimental use</h2>
        <p>
          This is a simulation for learning and experimentation. It is not a
          production flight controller or a service for controlling physical
          equipment. Results may be inaccurate or unavailable, and the demo may
          change or be withdrawn.
        </p>

        <h2>Your provider accounts and costs</h2>
        <p>
          Local mode needs no provider account. If you enable live mode, you
          supply your own OpenRouter or TypeSafe credentials and are responsible
          for their use, security, and any charges from those providers. Check
          their pricing and account terms before running live missions. You can
          remove saved keys in Settings; revoke a key with its provider if you
          need to invalidate it.
        </p>

        <h2>Appropriate use</h2>
        <p>
          Do not use the demo to disrupt the service, access other people&apos;s
          accounts, or violate applicable law or a provider&apos;s terms. Do not
          submit secrets or sensitive personal information in mission inputs.
        </p>

        <h2>Availability and responsibility</h2>
        <p>
          The demo is provided as available, without a promise that it will be
          uninterrupted, error-free, or suitable for a particular purpose. To
          the extent permitted by applicable law, the maintainer is not
          responsible for losses arising from use of the demo or third-party
          provider services. Nothing here excludes rights that cannot legally
          be excluded.
        </p>

        <h2>Questions</h2>
        <p>
          Contact <a href="mailto:m.khordoo@gmail.com">m.khordoo@gmail.com</a>.
          See the <Link href="/privacy">Privacy Notice</Link> for how keys and
          mission data are handled.
        </p>
      </article>
    </main>
  );
}
