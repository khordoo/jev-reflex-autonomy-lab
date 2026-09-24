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

        <h2>Experimental use only</h2>
        <p>
          This project is a software simulation provided solely for
          demonstration, research, learning, and experimentation. It is not a
          production flight controller, navigation system, safety system, or
          software intended to control drones, vehicles, robots, or any other
          physical equipment.
        </p>
        <p>
          Do not use the software, model outputs, decisions, confidence scores,
          or control logic to operate physical equipment or for any
          safety-critical or real-world autonomous system.
        </p>
        <p>
          To the fullest extent permitted by applicable law, the maintainer is
          not responsible for injury, property damage, equipment damage,
          financial loss, or any other harm resulting from use or attempted use
          of this software outside the simulated environment.
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

        <h2>Third-party services</h2>
        <p>
          Live mode connects to third-party services, including TypeSafe and
          OpenRouter. Those services are not operated, endorsed, or controlled
          by this project. Your use of them is governed by their own terms,
          privacy policies, usage restrictions, and pricing. You are responsible
          for ensuring that use of your provider account and credentials through
          this demo is permitted by the applicable provider.
        </p>

        <h2>Appropriate use</h2>
        <p>
          Do not use the demo to disrupt the service, access other people&apos;s
          accounts, or violate applicable law or a provider&apos;s terms. Do not
          submit secrets or sensitive personal information in mission inputs.
        </p>

        <h2>Disclaimer of warranties</h2>
        <p>
          To the fullest extent permitted by applicable law, the hosted demo is
          provided “as is” and “as available,” without warranties of any kind,
          express or implied, including warranties of accuracy, reliability,
          availability, merchantability, fitness for a particular purpose, and
          non-infringement. Model outputs, confidence values, simulation results,
          and third-party services may be inaccurate, delayed, unavailable, or
          change without notice.
        </p>

        <h2>Limitation of liability</h2>
        <p>
          To the fullest extent permitted by applicable law, the maintainer will
          not be liable for any indirect, incidental, special, consequential,
          exemplary, or punitive damages, or for loss of data, API credits,
          profits, business opportunities, or goodwill arising from or related
          to use of the hosted demo or third-party provider services. To the
          fullest extent permitted by applicable law, the maintainer&apos;s
          aggregate liability for claims arising from the hosted demo will not
          exceed CAD $100. Nothing in these Terms limits liability or rights
          that cannot lawfully be limited or excluded.
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
