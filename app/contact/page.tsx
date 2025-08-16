export default function ContactPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/20 p-8 text-center">
          <h1 className="text-3xl font-bold text-white mb-4">Contact Support</h1>
          <p className="text-blue-200 mb-6">
            Need help? Please email us at support@chainreact.app and we'll get back to you as soon as possible.
          </p>
          <a 
            href="mailto:support@chainreact.app"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            Send Email
          </a>
        </div>
      </div>
    </div>
  )
}