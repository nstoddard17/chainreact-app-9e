"use client"

import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export function PrivacyPolicy() {
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
          <h1 className="text-4xl font-bold text-slate-900">Privacy Policy</h1>
          <p className="text-slate-600 mt-2">Last updated: December 31, 2024</p>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="prose prose-slate max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">1. Introduction</h2>
            <p className="text-slate-700 mb-4">
              Welcome to ChainReact ("we," "our," or "us"). We are committed to protecting your privacy and ensuring the
              security of your personal information. This Privacy Policy explains how we collect, use, disclose, and
              safeguard your information when you use our workflow automation platform and services.
            </p>
            <p className="text-slate-700">
              By using ChainReact, you agree to the collection and use of information in accordance with this Privacy
              Policy.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">2. Information We Collect</h2>

            <h3 className="text-xl font-semibold text-slate-900 mb-3">2.1 Personal Information</h3>
            <p className="text-slate-700 mb-4">We may collect the following personal information:</p>
            <ul className="list-disc pl-6 text-slate-700 mb-4">
              <li>Name and email address when you create an account</li>
              <li>Profile information you choose to provide</li>
              <li>Payment information for subscription services</li>
              <li>Communication preferences and settings</li>
            </ul>

            <h3 className="text-xl font-semibold text-slate-900 mb-3">2.2 Usage Information</h3>
            <p className="text-slate-700 mb-4">We automatically collect information about how you use our services:</p>
            <ul className="list-disc pl-6 text-slate-700 mb-4">
              <li>Workflow creation and execution data</li>
              <li>Integration usage and performance metrics</li>
              <li>Device information and browser type</li>
              <li>IP address and location data</li>
              <li>Log files and analytics data</li>
            </ul>

            <h3 className="text-xl font-semibold text-slate-900 mb-3">2.3 Third-Party Integration Data</h3>
            <p className="text-slate-700 mb-4">
              When you connect third-party services to ChainReact, we may access and store data from those services as
              necessary to provide our automation features. This includes:
            </p>
            <ul className="list-disc pl-6 text-slate-700">
              <li>OAuth tokens and authentication credentials</li>
              <li>Data from connected applications (emails, calendar events, files, etc.)</li>
              <li>Metadata about your connected accounts</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">3. How We Use Your Information</h2>
            <p className="text-slate-700 mb-4">We use your information to:</p>
            <ul className="list-disc pl-6 text-slate-700">
              <li>Provide, maintain, and improve our services</li>
              <li>Process transactions and manage your account</li>
              <li>Execute workflows and automate tasks as configured</li>
              <li>Communicate with you about our services</li>
              <li>Provide customer support and technical assistance</li>
              <li>Analyze usage patterns to improve our platform</li>
              <li>Ensure security and prevent fraud</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">4. Information Sharing and Disclosure</h2>
            <p className="text-slate-700 mb-4">
              We do not sell, trade, or rent your personal information. We may share your information in the following
              circumstances:
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mb-3">4.1 Service Providers</h3>
            <p className="text-slate-700 mb-4">
              We may share information with trusted third-party service providers who assist us in operating our
              platform, such as cloud hosting, payment processing, and analytics services.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mb-3">4.2 Legal Requirements</h3>
            <p className="text-slate-700 mb-4">
              We may disclose information if required by law, court order, or government request, or to protect our
              rights, property, or safety.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mb-3">4.3 Business Transfers</h3>
            <p className="text-slate-700">
              In the event of a merger, acquisition, or sale of assets, your information may be transferred as part of
              the transaction.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">5. Data Security</h2>
            <p className="text-slate-700 mb-4">
              We implement industry-standard security measures to protect your information:
            </p>
            <ul className="list-disc pl-6 text-slate-700">
              <li>Encryption in transit and at rest</li>
              <li>Regular security audits and assessments</li>
              <li>Access controls and authentication</li>
              <li>Secure data centers and infrastructure</li>
              <li>Employee training on data protection</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">6. Your Rights and Choices</h2>
            <p className="text-slate-700 mb-4">You have the following rights regarding your personal information:</p>
            <ul className="list-disc pl-6 text-slate-700">
              <li>
                <strong>Access:</strong> Request a copy of your personal information
              </li>
              <li>
                <strong>Correction:</strong> Update or correct inaccurate information
              </li>
              <li>
                <strong>Deletion:</strong> Request deletion of your personal information
              </li>
              <li>
                <strong>Portability:</strong> Export your data in a machine-readable format
              </li>
              <li>
                <strong>Opt-out:</strong> Unsubscribe from marketing communications
              </li>
            </ul>
            <p className="text-slate-700 mt-4">
              To exercise these rights, please contact us at privacy@chainreact.app.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">7. Data Retention</h2>
            <p className="text-slate-700">
              We retain your information for as long as necessary to provide our services and comply with legal
              obligations. When you delete your account, we will delete your personal information within 30 days, except
              where retention is required by law.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">8. International Data Transfers</h2>
            <p className="text-slate-700">
              Your information may be transferred to and processed in countries other than your own. We ensure
              appropriate safeguards are in place to protect your information in accordance with applicable data
              protection laws.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">9. Children's Privacy</h2>
            <p className="text-slate-700">
              Our services are not intended for children under 13 years of age. We do not knowingly collect personal
              information from children under 13. If you become aware that a child has provided us with personal
              information, please contact us.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">10. Changes to This Privacy Policy</h2>
            <p className="text-slate-700">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new
              Privacy Policy on this page and updating the "Last updated" date. We encourage you to review this Privacy
              Policy periodically.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">11. Contact Us</h2>
            <p className="text-slate-700 mb-4">
              If you have any questions about this Privacy Policy or our privacy practices, please contact us:
            </p>
            <div className="bg-slate-50 p-4 rounded-lg">
              <p className="text-slate-700">
                <strong>Email:</strong> privacy@chainreact.app
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

export default PrivacyPolicy
