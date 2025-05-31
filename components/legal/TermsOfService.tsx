"use client"

import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-slate-50 border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link href="/">
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Button>
          </Link>
          <h1 className="text-4xl font-bold text-slate-900">Terms of Service</h1>
          <p className="text-slate-600 mt-2">Last updated: December 31, 2024</p>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="prose prose-slate max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">1. Acceptance of Terms</h2>
            <p className="text-slate-700 mb-4">
              Welcome to ChainReact. These Terms of Service ("Terms") govern your use of the ChainReact platform and
              services ("Service") operated by ChainReact, Inc. ("us", "we", or "our").
            </p>
            <p className="text-slate-700">
              By accessing or using our Service, you agree to be bound by these Terms. If you disagree with any part of
              these terms, then you may not access the Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">2. Description of Service</h2>
            <p className="text-slate-700 mb-4">
              ChainReact is a workflow automation platform that allows users to connect various applications and
              services to create automated workflows. Our Service includes:
            </p>
            <ul className="list-disc pl-6 text-slate-700">
              <li>Visual workflow builder and editor</li>
              <li>Integration with third-party applications and services</li>
              <li>Workflow execution and monitoring</li>
              <li>Analytics and reporting features</li>
              <li>Team collaboration tools</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">3. User Accounts</h2>

            <h3 className="text-xl font-semibold text-slate-900 mb-3">3.1 Account Creation</h3>
            <p className="text-slate-700 mb-4">
              To use our Service, you must create an account. You agree to provide accurate, current, and complete
              information during registration and to update such information to keep it accurate, current, and complete.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mb-3">3.2 Account Security</h3>
            <p className="text-slate-700 mb-4">
              You are responsible for safeguarding your account credentials and for all activities that occur under your
              account. You agree to notify us immediately of any unauthorized use of your account.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mb-3">3.3 Account Termination</h3>
            <p className="text-slate-700">
              We may terminate or suspend your account at any time for violations of these Terms or for any other reason
              at our sole discretion.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">4. Acceptable Use</h2>
            <p className="text-slate-700 mb-4">You agree not to use the Service to:</p>
            <ul className="list-disc pl-6 text-slate-700">
              <li>Violate any applicable laws or regulations</li>
              <li>Infringe on the rights of others</li>
              <li>Transmit harmful, offensive, or inappropriate content</li>
              <li>Attempt to gain unauthorized access to our systems</li>
              <li>Interfere with or disrupt the Service</li>
              <li>Use the Service for any illegal or unauthorized purpose</li>
              <li>Reverse engineer or attempt to extract source code</li>
              <li>Create workflows that violate third-party terms of service</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">5. Subscription and Payment</h2>

            <h3 className="text-xl font-semibold text-slate-900 mb-3">5.1 Subscription Plans</h3>
            <p className="text-slate-700 mb-4">
              We offer various subscription plans with different features and usage limits. Current pricing and plan
              details are available on our website.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mb-3">5.2 Payment Terms</h3>
            <p className="text-slate-700 mb-4">
              Subscription fees are billed in advance on a monthly or annual basis. All fees are non-refundable except
              as required by law or as specifically stated in these Terms.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mb-3">5.3 Free Trial</h3>
            <p className="text-slate-700 mb-4">
              We may offer a free trial period. At the end of the trial, your subscription will automatically convert to
              a paid plan unless you cancel.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mb-3">5.4 Cancellation</h3>
            <p className="text-slate-700">
              You may cancel your subscription at any time. Cancellation will take effect at the end of your current
              billing period.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">6. Intellectual Property</h2>

            <h3 className="text-xl font-semibold text-slate-900 mb-3">6.1 Our Rights</h3>
            <p className="text-slate-700 mb-4">
              The Service and its original content, features, and functionality are owned by ChainReact and are
              protected by international copyright, trademark, patent, trade secret, and other intellectual property
              laws.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mb-3">6.2 Your Content</h3>
            <p className="text-slate-700 mb-4">
              You retain ownership of any content you create using our Service. By using the Service, you grant us a
              limited license to use, store, and process your content solely to provide the Service.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mb-3">6.3 Feedback</h3>
            <p className="text-slate-700">
              Any feedback, suggestions, or ideas you provide about the Service may be used by us without any obligation
              to you.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">7. Third-Party Integrations</h2>
            <p className="text-slate-700 mb-4">
              Our Service integrates with third-party applications and services. Your use of these integrations is
              subject to the terms and conditions of those third parties. We are not responsible for the availability,
              content, or practices of third-party services.
            </p>
            <p className="text-slate-700">
              You are responsible for ensuring that your use of third-party integrations complies with their respective
              terms of service and privacy policies.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibent text-slate-900 mb-4">8. Privacy and Data Protection</h2>
            <p className="text-slate-700">
              Your privacy is important to us. Please review our Privacy Policy, which also governs your use of the
              Service, to understand our practices regarding the collection and use of your information.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">9. Disclaimers and Limitation of Liability</h2>

            <h3 className="text-xl font-semibold text-slate-900 mb-3">9.1 Service Availability</h3>
            <p className="text-slate-700 mb-4">
              We strive to maintain high availability but cannot guarantee that the Service will be available 100% of
              the time. The Service is provided "as is" without warranties of any kind.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mb-3">9.2 Limitation of Liability</h3>
            <p className="text-slate-700 mb-4">
              To the maximum extent permitted by law, ChainReact shall not be liable for any indirect, incidental,
              special, consequential, or punitive damages, including but not limited to loss of profits, data, or
              business interruption.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mb-3">9.3 Maximum Liability</h3>
            <p className="text-slate-700">
              Our total liability to you for any claims arising from or related to the Service shall not exceed the
              amount you paid us in the 12 months preceding the claim.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">10. Indemnification</h2>
            <p className="text-slate-700">
              You agree to indemnify and hold harmless ChainReact and its officers, directors, employees, and agents
              from any claims, damages, losses, or expenses arising from your use of the Service or violation of these
              Terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">11. Termination</h2>
            <p className="text-slate-700 mb-4">
              We may terminate or suspend your access to the Service immediately, without prior notice, for any reason,
              including breach of these Terms.
            </p>
            <p className="text-slate-700">
              Upon termination, your right to use the Service will cease immediately. All provisions of these Terms that
              by their nature should survive termination shall survive.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">12. Governing Law</h2>
            <p className="text-slate-700">
              These Terms shall be governed by and construed in accordance with the laws of the State of California,
              without regard to its conflict of law provisions. Any disputes shall be resolved in the courts of San
              Francisco County, California.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">13. Changes to Terms</h2>
            <p className="text-slate-700">
              We reserve the right to modify these Terms at any time. We will notify you of any changes by posting the
              new Terms on this page and updating the "Last updated" date. Your continued use of the Service after such
              changes constitutes acceptance of the new Terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">14. Contact Information</h2>
            <p className="text-slate-700 mb-4">If you have any questions about these Terms, please contact us:</p>
            <div className="bg-slate-50 p-4 rounded-lg">
              <p className="text-slate-700">
                <strong>Email:</strong> legal@chainreact.app
                <br />
                <strong>Address:</strong> ChainReact, Inc.
                <br />
                123 Automation Street
                <br />
                San Francisco, CA 94105
                <br />
                United States
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
