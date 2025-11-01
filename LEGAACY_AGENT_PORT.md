## Legacy Agent Source

````tsx
      {/* ReactAgent Chat Panel */}
      <div
        className={`absolute top-0 left-0 h-full bg-background border-r border-border shadow-xl z-40 transition-transform duration-300 ease-in-out ${
          isReactAgentOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ width: `${REACT_AGENT_PANEL_WIDTH}px` }}
      >
        <div className="h-full flex flex-col">
          {/* Chat Header - No bottom border */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <Image
                src="/logo_transparent.png"
                alt="ChainReact"
                width={24}
                height={24}
                className="w-6 h-6"
              />
              <h2 className="font-semibold text-sm text-foreground">React Agent</h2>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-[11px] text-foreground hover:bg-accent gap-1.5"
              >
                <Sparkles className="w-3 h-3" />
                Agent Context
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-foreground hover:bg-accent"
              >
                <HelpCircle className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsReactAgentOpen(false)}
                className="h-8 w-8 text-foreground hover:bg-accent"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Chat Content */}
          <div className="flex-1 overflow-hidden px-4 flex flex-col">
            {/* Always show welcome message */}
            <div className="text-sm text-foreground space-y-2 pt-2 pb-3">
              <p>Hello, what would you like to craft?</p>
              <p className="text-xs">Tell me about your goal or task, and include the tools you normally use (like your email, calendar, or CRM).</p>
            </div>

            {/* Chat messages */}
            <ScrollArea className="flex-1 pr-2">
              <div className="space-y-4 py-4">
                {reactAgentMessages.map((msg, index) => (
                  <div
                    key={index}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-3 ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-accent text-foreground'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}

                {/* Show clarification questions BEFORE plan */}
                {showClarifications && clarificationQuestions.length > 0 && (
                  <div className="space-y-3">
                    {clarificationQuestions.map((question) => (
                      <ClarificationQuestion
                        key={question.id}
                        question={question}
                        answer={clarificationAnswers[question.id]}
                        onAnswer={(questionId, answer) => {
                          setClarificationAnswers(prev => {
                            const next = { ...prev }
                            const value = answer?.value
                            const hasValue = Array.isArray(value)
                              ? value.length > 0
                              : typeof value === 'string'
                                ? value.trim().length > 0
                                : value !== undefined && value !== null

                            if (!hasValue) {
                              delete next[questionId]
                              clarificationAnswersRef.current = next
                              return next
                            }

                            next[questionId] = answer
                            clarificationAnswersRef.current = next
                            return next
                          })
                        }}
                      />
                    ))}

                    {/* Submit clarifications button */}
                    {requiredClarificationsAnswered && (
                      <Button
                        onClick={async () => {
                          logger.info('[CLARIFICATION] User submitted answers:', clarificationAnswers)

                          // Hide clarifications, proceed with workflow build
                          setShowClarifications(false)
                          setWaitingForClarifications(false)
                          setClarificationQuestions([])
````
