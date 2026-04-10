"use client"

import LoginForm from "@/components/auth/LoginForm"

export default function LoginPage() {
  return (
    <>
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold text-white mb-2">Welcome to ChainReact</h1>
        <p className="text-orange-200">Automate your workflows with ease</p>
      </div>
      <LoginForm />
    </>
  )
}
