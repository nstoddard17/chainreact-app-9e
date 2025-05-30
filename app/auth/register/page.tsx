import RegisterForm from "@/components/auth/RegisterForm"

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Join ChainReact</h1>
          <p className="text-slate-600">Start automating your workflows today</p>
        </div>
        <RegisterForm />
      </div>
    </div>
  )
}
