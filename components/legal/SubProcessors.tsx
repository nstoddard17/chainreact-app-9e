"use client"

import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export function SubProcessors() {
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
          <h1 className="text-4xl font-bold text-slate-900">Sub-processors</h1>
          <p className="text-slate-600 mt-2">Last updated: December 31, 2024</p>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="prose prose-slate max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">1. Introduction</h2>
            <p className="text-slate-700 mb-4">
              ChainReact uses certain sub-processors to assist in providing our workflow automation services. 
              A sub-processor is a third-party data processor engaged by ChainReact who has or potentially 
              will have access to or process personal data on our behalf.
            </p>
            <p className="text-slate-700 mb-4">
              We maintain an up-to-date list of the names and locations of all sub-processors used for 
              processing personal data. This list is provided below.
            </p>
            <p className="text-slate-700">
              We ensure that all sub-processors are bound by data processing agreements that require them 
              to protect personal data in accordance with applicable data protection laws and our privacy standards.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">2. Core Infrastructure Sub-processors</h2>
            <p className="text-slate-700 mb-4">
              These sub-processors provide essential infrastructure services for our platform:
            </p>
            
            <div className="bg-slate-50 p-6 rounded-lg mb-6">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Supabase</h3>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium text-slate-900">Purpose:</p>
                  <p className="text-slate-700">Database, authentication, and backend services</p>
                </div>
                <div>
                  <p className="font-medium text-slate-900">Data Location:</p>
                  <p className="text-slate-700">United States (AWS US East)</p>
                </div>
                <div>
                  <p className="font-medium text-slate-900">Data Processed:</p>
                  <p className="text-slate-700">User accounts, workflows, integrations, audit logs</p>
                </div>
                <div>
                  <p className="font-medium text-slate-900">Certifications:</p>
                  <p className="text-slate-700">SOC 2 Type II, GDPR, HIPAA</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-6 rounded-lg mb-6">
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Vercel</h3>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium text-slate-900">Purpose:</p>
                  <p className="text-slate-700">Hosting, CDN, and deployment platform</p>
                </div>
                <div>
                  <p className="font-medium text-slate-900">Data Location:</p>
                  <p className="text-slate-700">Global (Edge locations)</p>
                </div>
                <div>
                  <p className="font-medium text-slate-900">Data Processed:</p>
                  <p className="text-slate-700">Application logs, performance metrics</p>
                </div>
                <div>
                  <p className="font-medium text-slate-900">Certifications:</p>
                  <p className="text-slate-700">SOC 2 Type II, GDPR</p>
                </div>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">3. Authentication & SSO Sub-processors</h2>
            <p className="text-slate-700 mb-4">
              These sub-processors handle user authentication and single sign-on services:
            </p>
            
            <div className="grid gap-4 md:grid-cols-2">
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">Google</h4>
                <p className="text-sm text-slate-700 mb-2">Gmail, Drive, Sheets, Docs, Calendar, YouTube</p>
                <p className="text-xs text-slate-600">Data: OAuth tokens, user profile, service data</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">Microsoft</h4>
                <p className="text-sm text-slate-700 mb-2">Teams, OneDrive, Microsoft Forms</p>
                <p className="text-xs text-slate-600">Data: OAuth tokens, user profile, service data</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">GitHub</h4>
                <p className="text-sm text-slate-700 mb-2">Code repositories and user authentication</p>
                <p className="text-xs text-slate-600">Data: OAuth tokens, repository access</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">Slack</h4>
                <p className="text-sm text-slate-700 mb-2">Team communication and messaging</p>
                <p className="text-xs text-slate-600">Data: OAuth tokens, workspace access</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">Discord</h4>
                <p className="text-sm text-slate-700 mb-2">Community platform and messaging</p>
                <p className="text-xs text-slate-600">Data: OAuth tokens, server access</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">LinkedIn</h4>
                <p className="text-sm text-slate-700 mb-2">Professional networking</p>
                <p className="text-xs text-slate-600">Data: OAuth tokens, profile data</p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">4. Business & Productivity Sub-processors</h2>
            <p className="text-slate-700 mb-4">
              These sub-processors provide business and productivity tools:
            </p>
            
            <div className="grid gap-4 md:grid-cols-2">
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">Notion</h4>
                <p className="text-sm text-slate-700 mb-2">Documentation and collaboration</p>
                <p className="text-xs text-slate-600">Data: OAuth tokens, workspace data</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">Trello</h4>
                <p className="text-sm text-slate-700 mb-2">Project management</p>
                <p className="text-xs text-slate-600">Data: OAuth tokens, board data</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">Airtable</h4>
                <p className="text-sm text-slate-700 mb-2">Database and automation</p>
                <p className="text-xs text-slate-600">Data: OAuth tokens, base data</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">HubSpot</h4>
                <p className="text-sm text-slate-700 mb-2">CRM and marketing</p>
                <p className="text-xs text-slate-600">Data: OAuth tokens, contact data</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">Mailchimp</h4>
                <p className="text-sm text-slate-700 mb-2">Email marketing</p>
                <p className="text-xs text-slate-600">Data: OAuth tokens, audience data</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">Kit</h4>
                <p className="text-sm text-slate-700 mb-2">Email marketing</p>
                <p className="text-xs text-slate-600">Data: OAuth tokens, subscriber data</p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">5. File Storage & Cloud Sub-processors</h2>
            <p className="text-slate-700 mb-4">
              These sub-processors provide file storage and cloud services:
            </p>
            
            <div className="grid gap-4 md:grid-cols-2">
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">Dropbox</h4>
                <p className="text-sm text-slate-700 mb-2">File storage and sharing</p>
                <p className="text-xs text-slate-600">Data: OAuth tokens, file metadata</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">Box</h4>
                <p className="text-sm text-slate-700 mb-2">Enterprise file storage</p>
                <p className="text-xs text-slate-600">Data: OAuth tokens, file metadata</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">GitLab</h4>
                <p className="text-sm text-slate-700 mb-2">Code repositories</p>
                <p className="text-xs text-slate-600">Data: OAuth tokens, repository data</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">Docker Hub</h4>
                <p className="text-sm text-slate-700 mb-2">Container registry</p>
                <p className="text-xs text-slate-600">Data: OAuth tokens, container metadata</p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">6. E-commerce & Payment Sub-processors</h2>
            <p className="text-slate-700 mb-4">
              These sub-processors handle payments and e-commerce:
            </p>
            
            <div className="grid gap-4 md:grid-cols-2">
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">Stripe</h4>
                <p className="text-sm text-slate-700 mb-2">Payment processing</p>
                <p className="text-xs text-slate-600">Data: Payment info, transaction data</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">PayPal</h4>
                <p className="text-sm text-slate-700 mb-2">Payment processing</p>
                <p className="text-xs text-slate-600">Data: Payment info, transaction data</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">Shopify</h4>
                <p className="text-sm text-slate-700 mb-2">E-commerce platform</p>
                <p className="text-xs text-slate-600">Data: OAuth tokens, store data</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">GlobalPayments</h4>
                <p className="text-sm text-slate-700 mb-2">Payment processing</p>
                <p className="text-xs text-slate-600">Data: Payment info, transaction data</p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">7. Social Media & Content Sub-processors</h2>
            <p className="text-slate-700 mb-4">
              These sub-processors handle social media and content creation:
            </p>
            
            <div className="grid gap-4 md:grid-cols-2">
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">Facebook</h4>
                <p className="text-sm text-slate-700 mb-2">Social media platform</p>
                <p className="text-xs text-slate-600">Data: OAuth tokens, page data</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">Instagram</h4>
                <p className="text-sm text-slate-700 mb-2">Social media platform</p>
                <p className="text-xs text-slate-600">Data: OAuth tokens, media data</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">TikTok</h4>
                <p className="text-sm text-slate-700 mb-2">Social media platform</p>
                <p className="text-xs text-slate-600">Data: OAuth tokens, video data</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">Twitter/X</h4>
                <p className="text-sm text-slate-700 mb-2">Social media platform</p>
                <p className="text-xs text-slate-600">Data: OAuth tokens, tweet data</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">Canva</h4>
                <p className="text-sm text-slate-700 mb-2">Design platform</p>
                <p className="text-xs text-slate-600">Data: OAuth tokens, design data</p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">8. AI & Analytics Sub-processors</h2>
            <p className="text-slate-700 mb-4">
              These sub-processors provide AI and analytics services:
            </p>
            
            <div className="grid gap-4 md:grid-cols-2">
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">OpenAI</h4>
                <p className="text-sm text-slate-700 mb-2">AI workflow generation</p>
                <p className="text-xs text-slate-600">Data: Workflow descriptions, prompts</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">Anthropic</h4>
                <p className="text-sm text-slate-700 mb-2">AI workflow generation</p>
                <p className="text-xs text-slate-600">Data: Workflow descriptions, prompts</p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">9. Specialized Business Sub-processors</h2>
            <p className="text-slate-700 mb-4">
              These sub-processors provide specialized business services:
            </p>
            
            <div className="grid gap-4 md:grid-cols-2">
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">Blackbaud</h4>
                <p className="text-sm text-slate-700 mb-2">Nonprofit software</p>
                <p className="text-xs text-slate-600">Data: OAuth tokens, nonprofit data</p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">10. Data Processing Agreements</h2>
            <p className="text-slate-700 mb-4">
              We have entered into data processing agreements with all sub-processors that process personal data. 
              These agreements ensure that sub-processors:
            </p>
            <ul className="list-disc pl-6 text-slate-700 mb-4">
              <li>Process personal data only as instructed by ChainReact</li>
              <li>Implement appropriate technical and organizational security measures</li>
              <li>Assist us in responding to data subject requests</li>
              <li>Notify us of any data breaches</li>
              <li>Delete or return personal data upon termination of services</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">11. Updates to Sub-processors</h2>
            <p className="text-slate-700 mb-4">
              We may update this list of sub-processors from time to time. When we add a new sub-processor, 
              we will:
            </p>
            <ul className="list-disc pl-6 text-slate-700 mb-4">
              <li>Update this page with the new sub-processor information</li>
              <li>Notify existing customers via email at least 30 days in advance</li>
              <li>Provide an opportunity to object to the new sub-processor</li>
              <li>Update the "Last updated" date at the top of this page</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">12. Contact Information</h2>
            <p className="text-slate-700 mb-4">
              If you have any questions about our sub-processors or would like to object to the use of a 
              particular sub-processor, please contact us:
            </p>
            <div className="bg-slate-50 p-4 rounded-lg">
              <p className="text-slate-700">
                <strong>Email:</strong> chainreact@gmail.com
                <br />
                <strong>Subject:</strong> Sub-processor Inquiry
                <br />
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default SubProcessors
