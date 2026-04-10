"use client"

import RegisterForm from "@/components/auth/RegisterForm"

export default function RegisterPage() {
  return (
    <>
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold text-white mb-2">Join ChainReact</h1>
        <p className="text-orange-200">Start automating your workflows today</p>
      </div>
      <RegisterForm />
    </>
  )
}
