"use client"

const steps = [
  {
    number: '01',
    title: 'Describe',
    description:
      'Tell ChainReact what you need in plain English. "When I get a support email, classify it and route to the right channel."',
  },
  {
    number: '02',
    title: 'Watch AI build',
    description:
      'AI creates nodes, connects them, fills in every field — live on your canvas. No configuration needed.',
  },
  {
    number: '03',
    title: 'Refine & run',
    description:
      'Tweak anything conversationally. Hit activate. Your workflow runs 24/7 with monitoring built in.',
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-[#fafafa] px-4 sm:px-6 lg:px-8 py-20">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 mb-4">
            How it works
          </h2>
          <p className="text-lg text-slate-500 max-w-xl mx-auto">
            From idea to running workflow in 60 seconds
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-0">
          {steps.map((step, index) => (
            <div key={step.number} className="relative px-6">
              {/* Vertical divider between steps on desktop */}
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute right-0 top-0 bottom-0 w-px bg-slate-200" />
              )}
              {/* Horizontal divider between steps on mobile */}
              {index < steps.length - 1 && (
                <div className="md:hidden absolute left-6 right-6 bottom-[-20px] h-px bg-slate-200" />
              )}

              <span className="text-5xl font-bold text-slate-200 leading-none">
                {step.number}
              </span>
              <h3 className="text-xl font-semibold text-slate-900 mt-4 mb-2">
                {step.title}
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
