/**
 * Localization system for Smart AI Agent
 * Supports multiple languages for prompts, error messages, and user interfaces
 */

export interface LocalizedString {
  en: string;
  es?: string;
  fr?: string;
  de?: string;
  it?: string;
  pt?: string;
  nl?: string;
  ru?: string;
  ja?: string;
  ko?: string;
  zh?: string;
  [key: string]: string | undefined;
}

export interface LocalizationConfig {
  defaultLanguage: string;
  fallbackLanguage: string;
  supportedLanguages: string[];
  dateFormats: Record<string, string>;
  numberFormats: Record<string, Intl.NumberFormatOptions>;
}

export interface PromptTranslations {
  systemPrompts: {
    fieldExtraction: LocalizedString;
    safetyValidation: LocalizedString;
    fallbackGeneration: LocalizedString;
    contextualPrompt: LocalizedString;
  };
  errorMessages: {
    apiKeyMissing: LocalizedString;
    rateLimitExceeded: LocalizedString;
    invalidInput: LocalizedString;
    processingError: LocalizedString;
    safetyViolation: LocalizedString;
    timeoutError: LocalizedString;
  };
  userMessages: {
    extractionStarted: LocalizedString;
    extractionCompleted: LocalizedString;
    fallbackUsed: LocalizedString;
    lowConfidence: LocalizedString;
    highTokenUsage: LocalizedString;
    successWithWarnings: LocalizedString;
  };
  fieldLabels: {
    name: LocalizedString;
    email: LocalizedString;
    phone: LocalizedString;
    address: LocalizedString;
    date: LocalizedString;
    amount: LocalizedString;
    description: LocalizedString;
    priority: LocalizedString;
    status: LocalizedString;
    category: LocalizedString;
  };
}

export class LocalizationManager {
  private config: LocalizationConfig;
  private translations: PromptTranslations;
  private userLanguageCache = new Map<string, string>();

  constructor(config?: Partial<LocalizationConfig>) {
    this.config = {
      defaultLanguage: 'en',
      fallbackLanguage: 'en',
      supportedLanguages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'ko', 'zh'],
      dateFormats: {
        en: 'MM/dd/yyyy',
        es: 'dd/MM/yyyy',
        fr: 'dd/MM/yyyy',
        de: 'dd.MM.yyyy',
        it: 'dd/MM/yyyy',
        pt: 'dd/MM/yyyy',
        nl: 'dd-MM-yyyy',
        ru: 'dd.MM.yyyy',
        ja: 'yyyy/MM/dd',
        ko: 'yyyy. MM. dd.',
        zh: 'yyyy年MM月dd日'
      },
      numberFormats: {
        en: { style: 'decimal', minimumFractionDigits: 2 },
        es: { style: 'decimal', minimumFractionDigits: 2 },
        fr: { style: 'decimal', minimumFractionDigits: 2 },
        de: { style: 'decimal', minimumFractionDigits: 2 },
        it: { style: 'decimal', minimumFractionDigits: 2 },
        pt: { style: 'decimal', minimumFractionDigits: 2 },
        nl: { style: 'decimal', minimumFractionDigits: 2 },
        ru: { style: 'decimal', minimumFractionDigits: 2 },
        ja: { style: 'decimal', minimumFractionDigits: 2 },
        ko: { style: 'decimal', minimumFractionDigits: 2 },
        zh: { style: 'decimal', minimumFractionDigits: 2 }
      },
      ...config
    };

    this.translations = this.initializeTranslations();
  }

  /**
   * Get localized text for a given key and language
   */
  getText(key: keyof PromptTranslations, subKey: string, language: string): string {
    const section = this.translations[key] as any;
    const localizedString = section?.[subKey] as LocalizedString;
    
    if (!localizedString) {
      return `[${key}.${subKey}]`; // Return key if not found
    }

    // Try requested language
    if (localizedString[language]) {
      return localizedString[language]!;
    }

    // Fall back to default language
    if (localizedString[this.config.defaultLanguage]) {
      return localizedString[this.config.defaultLanguage]!;
    }

    // Final fallback to English
    return localizedString.en || `[${key}.${subKey}]`;
  }

  /**
   * Get system prompt in specified language
   */
  getSystemPrompt(type: keyof PromptTranslations['systemPrompts'], language: string): string {
    return this.getText('systemPrompts', type, language);
  }

  /**
   * Get error message in specified language
   */
  getErrorMessage(type: keyof PromptTranslations['errorMessages'], language: string): string {
    return this.getText('errorMessages', type, language);
  }

  /**
   * Get user message in specified language
   */
  getUserMessage(type: keyof PromptTranslations['userMessages'], language: string): string {
    return this.getText('userMessages', type, language);
  }

  /**
   * Get field label in specified language
   */
  getFieldLabel(field: keyof PromptTranslations['fieldLabels'], language: string): string {
    return this.getText('fieldLabels', field, language);
  }

  /**
   * Detect language from user input
   */
  detectLanguage(text: string): string {
    // Simple language detection based on character patterns
    // In production, you'd use a proper language detection library
    
    // Check for specific character sets
    if (/[\u4e00-\u9fff]/.test(text)) return 'zh'; // Chinese characters
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja'; // Japanese hiragana/katakana
    if (/[\uac00-\ud7af]/.test(text)) return 'ko'; // Korean
    if (/[\u0400-\u04ff]/.test(text)) return 'ru'; // Cyrillic
    
    // Check for language-specific words
    const lowerText = text.toLowerCase();
    
    if (this.containsWords(lowerText, ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all'])) return 'en';
    if (this.containsWords(lowerText, ['el', 'la', 'de', 'que', 'y', 'en', 'es', 'se'])) return 'es';
    if (this.containsWords(lowerText, ['le', 'de', 'et', 'à', 'un', 'il', 'être', 'et'])) return 'fr';
    if (this.containsWords(lowerText, ['der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das'])) return 'de';
    if (this.containsWords(lowerText, ['il', 'di', 'che', 'e', 'la', 'per', 'un', 'in'])) return 'it';
    if (this.containsWords(lowerText, ['o', 'de', 'que', 'e', 'do', 'da', 'em', 'um'])) return 'pt';
    if (this.containsWords(lowerText, ['de', 'het', 'een', 'en', 'van', 'te', 'dat', 'op'])) return 'nl';
    if (this.containsWords(lowerText, ['в', 'и', 'не', 'на', 'с', 'что', 'как', 'по'])) return 'ru';
    
    return this.config.defaultLanguage;
  }

  /**
   * Format date according to language preferences
   */
  formatDate(date: Date, language: string): string {
    const locale = this.getLocale(language);
    const format = this.config.dateFormats[language] || this.config.dateFormats[this.config.defaultLanguage];
    
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  }

  /**
   * Format number according to language preferences
   */
  formatNumber(number: number, language: string, style?: 'decimal' | 'currency' | 'percent'): string {
    const locale = this.getLocale(language);
    const options = this.config.numberFormats[language] || this.config.numberFormats[this.config.defaultLanguage];
    
    return new Intl.NumberFormat(locale, {
      ...options,
      style: style || options.style
    }).format(number);
  }

  /**
   * Format currency according to language preferences
   */
  formatCurrency(amount: number, currency: string, language: string): string {
    const locale = this.getLocale(language);
    
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency
    }).format(amount);
  }

  /**
   * Get user's preferred language (with caching)
   */
  async getUserLanguage(userId: string): Promise<string> {
    // Check cache first
    if (this.userLanguageCache.has(userId)) {
      return this.userLanguageCache.get(userId)!;
    }

    try {
      // In a real implementation, you'd fetch from database
      // For now, return default
      const language = this.config.defaultLanguage;
      this.userLanguageCache.set(userId, language);
      return language;
    } catch (error) {
      return this.config.defaultLanguage;
    }
  }

  /**
   * Set user's preferred language
   */
  async setUserLanguage(userId: string, language: string): Promise<void> {
    if (!this.config.supportedLanguages.includes(language)) {
      throw new Error(`Language '${language}' is not supported`);
    }

    // Update cache
    this.userLanguageCache.set(userId, language);

    try {
      // In a real implementation, you'd save to database
      console.log(`Setting user ${userId} language to ${language}`);
    } catch (error) {
      console.error('Failed to save user language preference:', error);
    }
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): Array<{ code: string; name: string; nativeName: string }> {
    return [
      { code: 'en', name: 'English', nativeName: 'English' },
      { code: 'es', name: 'Spanish', nativeName: 'Español' },
      { code: 'fr', name: 'French', nativeName: 'Français' },
      { code: 'de', name: 'German', nativeName: 'Deutsch' },
      { code: 'it', name: 'Italian', nativeName: 'Italiano' },
      { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
      { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
      { code: 'ru', name: 'Russian', nativeName: 'Русский' },
      { code: 'ja', name: 'Japanese', nativeName: '日本語' },
      { code: 'ko', name: 'Korean', nativeName: '한국어' },
      { code: 'zh', name: 'Chinese', nativeName: '中文' }
    ].filter(lang => this.config.supportedLanguages.includes(lang.code));
  }

  /**
   * Create localized prompt for AI
   */
  createLocalizedPrompt(
    basePrompt: string,
    context: {
      language: string;
      tone?: 'professional' | 'casual' | 'friendly' | 'formal';
      domain?: string;
      userInstructions?: string;
    }
  ): string {
    const { language, tone = 'professional', domain, userInstructions } = context;

    let prompt = basePrompt;

    // Add language instruction
    if (language !== 'en') {
      const languageName = this.getSupportedLanguages().find(l => l.code === language)?.nativeName || language;
      prompt += `\n\nIMPORTANT: Respond in ${languageName} language.`;
    }

    // Add tone instruction
    const toneInstructions = {
      professional: this.getText('systemPrompts', 'contextualPrompt', language).replace('{tone}', 'professional and formal'),
      casual: this.getText('systemPrompts', 'contextualPrompt', language).replace('{tone}', 'casual and relaxed'),
      friendly: this.getText('systemPrompts', 'contextualPrompt', language).replace('{tone}', 'friendly and approachable'),
      formal: this.getText('systemPrompts', 'contextualPrompt', language).replace('{tone}', 'formal and precise')
    };

    prompt += `\n${toneInstructions[tone]}`;

    // Add domain-specific instructions
    if (domain) {
      prompt += `\nContext domain: ${domain}. Please consider domain-specific terminology and conventions.`;
    }

    // Add user instructions
    if (userInstructions) {
      prompt += `\nUser instructions: ${userInstructions}`;
    }

    return prompt;
  }

  /**
   * Validate if a language is supported
   */
  isLanguageSupported(language: string): boolean {
    return this.config.supportedLanguages.includes(language);
  }

  /**
   * Get locale string for Intl formatting
   */
  private getLocale(language: string): string {
    const localeMap: Record<string, string> = {
      en: 'en-US',
      es: 'es-ES',
      fr: 'fr-FR',
      de: 'de-DE',
      it: 'it-IT',
      pt: 'pt-BR',
      nl: 'nl-NL',
      ru: 'ru-RU',
      ja: 'ja-JP',
      ko: 'ko-KR',
      zh: 'zh-CN'
    };

    return localeMap[language] || localeMap[this.config.defaultLanguage];
  }

  /**
   * Check if text contains specific words
   */
  private containsWords(text: string, words: string[]): boolean {
    const textWords = text.split(/\s+/);
    let matches = 0;
    
    words.forEach(word => {
      if (textWords.includes(word)) {
        matches++;
      }
    });

    return matches >= Math.min(2, words.length); // At least 2 matches or all words if less than 2
  }

  /**
   * Initialize translation data
   */
  private initializeTranslations(): PromptTranslations {
    return {
      systemPrompts: {
        fieldExtraction: {
          en: "You are an expert field extraction AI. Extract the requested fields from the provided text accurately and completely.",
          es: "Eres una IA experta en extracción de campos. Extrae los campos solicitados del texto proporcionado de manera precisa y completa.",
          fr: "Vous êtes une IA experte en extraction de champs. Extrayez les champs demandés du texte fourni de manière précise et complète.",
          de: "Sie sind eine KI-Expertin für Feldextraktion. Extrahieren Sie die angeforderten Felder aus dem bereitgestellten Text genau und vollständig.",
          it: "Sei un'IA esperta nell'estrazione di campi. Estrai i campi richiesti dal testo fornito in modo accurato e completo.",
          pt: "Você é uma IA especialista em extração de campos. Extraia os campos solicitados do texto fornecido de forma precisa e completa.",
          nl: "Je bent een expert AI voor veldextractie. Extraheer de gevraagde velden uit de verstrekte tekst nauwkeurig en volledig.",
          ru: "Вы - ИИ-эксперт по извлечению полей. Извлекайте запрошенные поля из предоставленного текста точно и полно.",
          ja: "あなたはフィールド抽出のエキスパートAIです。提供されたテキストから要求されたフィールドを正確かつ完全に抽出してください。",
          ko: "당신은 필드 추출 전문 AI입니다. 제공된 텍스트에서 요청된 필드를 정확하고 완전하게 추출하세요.",
          zh: "您是字段提取专家AI。请准确完整地从提供的文本中提取所需字段。"
        },
        safetyValidation: {
          en: "Validate the extracted content for safety, accuracy, and appropriateness. Flag any potential issues.",
          es: "Valida el contenido extraído en cuanto a seguridad, precisión y adecuación. Marca cualquier problema potencial.",
          fr: "Validez le contenu extrait pour la sécurité, la précision et la pertinence. Signalez tout problème potentiel.",
          de: "Validieren Sie den extrahierten Inhalt auf Sicherheit, Genauigkeit und Angemessenheit. Kennzeichnen Sie potenzielle Probleme.",
          it: "Valida il contenuto estratto per sicurezza, accuratezza e appropriatezza. Segnala eventuali problemi potenziali.",
          pt: "Valide o conteúdo extraído quanto à segurança, precisão e adequação. Sinalize quaisquer problemas potenciais.",
          nl: "Valideer de geëxtraheerde inhoud op veiligheid, nauwkeurigheid en geschiktheid. Markeer mogelijke problemen.",
          ru: "Проверьте извлеченный контент на безопасность, точность и уместность. Отметьте любые потенциальные проблемы.",
          ja: "抽出されたコンテンツの安全性、正確性、適切性を検証してください。潜在的な問題があればフラグを立ててください。",
          ko: "추출된 콘텐츠의 안전성, 정확성, 적절성을 검증하세요. 잠재적인 문제가 있으면 플래그를 표시하세요.",
          zh: "验证提取内容的安全性、准确性和适当性。标记任何潜在问题。"
        },
        fallbackGeneration: {
          en: "Generate fallback values based on patterns and context when AI extraction fails.",
          es: "Genera valores de respaldo basados en patrones y contexto cuando falla la extracción de IA.",
          fr: "Générez des valeurs de secours basées sur des modèles et le contexte lorsque l'extraction IA échoue.",
          de: "Generieren Sie Fallback-Werte basierend auf Mustern und Kontext, wenn die KI-Extraktion fehlschlägt.",
          it: "Genera valori di fallback basati su pattern e contesto quando l'estrazione AI fallisce.",
          pt: "Gere valores de fallback baseados em padrões e contexto quando a extração de IA falha.",
          nl: "Genereer fallback-waarden gebaseerd op patronen en context wanneer AI-extractie faalt.",
          ru: "Генерируйте резервные значения на основе шаблонов и контекста, когда извлечение ИИ терпит неудачу.",
          ja: "AI抽出が失敗した場合、パターンとコンテキストに基づいてフォールバック値を生成してください。",
          ko: "AI 추출이 실패할 때 패턴과 컨텍스트를 기반으로 대체 값을 생성하세요.",
          zh: "当AI提取失败时，基于模式和上下文生成备用值。"
        },
        contextualPrompt: {
          en: "Use a {tone} tone and consider the user's cultural and linguistic context.",
          es: "Usa un tono {tone} y considera el contexto cultural y lingüístico del usuario.",
          fr: "Utilisez un ton {tone} et tenez compte du contexte culturel et linguistique de l'utilisateur.",
          de: "Verwenden Sie einen {tone} Ton und berücksichtigen Sie den kulturellen und sprachlichen Kontext des Benutzers.",
          it: "Usa un tono {tone} e considera il contesto culturale e linguistico dell'utente.",
          pt: "Use um tom {tone} e considere o contexto cultural e linguístico do usuário.",
          nl: "Gebruik een {tone} toon en houd rekening met de culturele en taalkundige context van de gebruiker.",
          ru: "Используйте {tone} тон и учитывайте культурный и языковой контекст пользователя.",
          ja: "{tone}なトーンを使用し、ユーザーの文化的・言語的コンテキストを考慮してください。",
          ko: "{tone} 톤을 사용하고 사용자의 문화적, 언어적 맥락을 고려하세요.",
          zh: "使用{tone}的语调，并考虑用户的文化和语言背景。"
        }
      },
      errorMessages: {
        apiKeyMissing: {
          en: "API key is missing or invalid",
          es: "La clave API falta o es inválida",
          fr: "La clé API est manquante ou invalide",
          de: "API-Schlüssel fehlt oder ist ungültig",
          it: "La chiave API è mancante o non valida",
          pt: "A chave da API está ausente ou é inválida",
          nl: "API-sleutel ontbreekt of is ongeldig",
          ru: "API-ключ отсутствует или недействителен",
          ja: "APIキーが不足しているか無効です",
          ko: "API 키가 누락되었거나 유효하지 않습니다",
          zh: "API密钥缺失或无效"
        },
        rateLimitExceeded: {
          en: "Rate limit exceeded. Please try again later.",
          es: "Límite de velocidad excedido. Inténtalo de nuevo más tarde.",
          fr: "Limite de débit dépassée. Veuillez réessayer plus tard.",
          de: "Ratenlimit überschritten. Bitte versuchen Sie es später erneut.",
          it: "Limite di velocità superato. Riprova più tardi.",
          pt: "Limite de taxa excedido. Tente novamente mais tarde.",
          nl: "Snelheidslimiet overschreden. Probeer het later opnieuw.",
          ru: "Превышен лимит скорости. Попробуйте позже.",
          ja: "レート制限を超えました。後でもう一度お試しください。",
          ko: "속도 제한을 초과했습니다. 나중에 다시 시도하세요.",
          zh: "超出速率限制。请稍后重试。"
        },
        invalidInput: {
          en: "Invalid input provided",
          es: "Entrada inválida proporcionada",
          fr: "Entrée invalide fournie",
          de: "Ungültige Eingabe bereitgestellt",
          it: "Input non valido fornito",
          pt: "Entrada inválida fornecida",
          nl: "Ongeldige invoer verstrekt",
          ru: "Предоставлен недопустимый ввод",
          ja: "無効な入力が提供されました",
          ko: "잘못된 입력이 제공되었습니다",
          zh: "提供的输入无效"
        },
        processingError: {
          en: "An error occurred during processing",
          es: "Ocurrió un error durante el procesamiento",
          fr: "Une erreur s'est produite lors du traitement",
          de: "Während der Verarbeitung ist ein Fehler aufgetreten",
          it: "Si è verificato un errore durante l'elaborazione",
          pt: "Ocorreu um erro durante o processamento",
          nl: "Er is een fout opgetreden tijdens de verwerking",
          ru: "Произошла ошибка во время обработки",
          ja: "処理中にエラーが発生しました",
          ko: "처리 중 오류가 발생했습니다",
          zh: "处理过程中发生错误"
        },
        safetyViolation: {
          en: "Content violates safety guidelines",
          es: "El contenido viola las pautas de seguridad",
          fr: "Le contenu viole les directives de sécurité",
          de: "Inhalt verstößt gegen Sicherheitsrichtlinien",
          it: "Il contenuto viola le linee guida di sicurezza",
          pt: "O conteúdo viola as diretrizes de segurança",
          nl: "Inhoud schendt veiligheidsrichtlijnen",
          ru: "Контент нарушает правила безопасности",
          ja: "コンテンツが安全ガイドラインに違反しています",
          ko: "콘텐츠가 안전 가이드라인을 위반합니다",
          zh: "内容违反安全准则"
        },
        timeoutError: {
          en: "Request timed out",
          es: "La solicitud expiró",
          fr: "La demande a expiré",
          de: "Anfrage ist abgelaufen",
          it: "La richiesta è scaduta",
          pt: "A solicitação expirou",
          nl: "Verzoek is verlopen",
          ru: "Запрос истек",
          ja: "リクエストがタイムアウトしました",
          ko: "요청이 시간 초과되었습니다",
          zh: "请求超时"
        }
      },
      userMessages: {
        extractionStarted: {
          en: "AI extraction started",
          es: "Extracción de IA iniciada",
          fr: "Extraction IA démarrée",
          de: "KI-Extraktion gestartet",
          it: "Estrazione AI avviata",
          pt: "Extração de IA iniciada",
          nl: "AI-extractie gestart",
          ru: "Извлечение ИИ началось",
          ja: "AI抽出を開始しました",
          ko: "AI 추출이 시작되었습니다",
          zh: "AI提取已开始"
        },
        extractionCompleted: {
          en: "Extraction completed successfully",
          es: "Extracción completada exitosamente",
          fr: "Extraction terminée avec succès",
          de: "Extraktion erfolgreich abgeschlossen",
          it: "Estrazione completata con successo",
          pt: "Extração concluída com sucesso",
          nl: "Extractie succesvol voltooid",
          ru: "Извлечение успешно завершено",
          ja: "抽出が正常に完了しました",
          ko: "추출이 성공적으로 완료되었습니다",
          zh: "提取成功完成"
        },
        fallbackUsed: {
          en: "Fallback method was used",
          es: "Se utilizó el método de respaldo",
          fr: "La méthode de secours a été utilisée",
          de: "Fallback-Methode wurde verwendet",
          it: "È stato utilizzato il metodo di fallback",
          pt: "Método de fallback foi usado",
          nl: "Fallback-methode werd gebruikt",
          ru: "Был использован резервный метод",
          ja: "フォールバック方法が使用されました",
          ko: "대체 방법이 사용되었습니다",
          zh: "使用了备用方法"
        },
        lowConfidence: {
          en: "Low confidence in results",
          es: "Baja confianza en los resultados",
          fr: "Faible confiance dans les résultats",
          de: "Geringes Vertrauen in die Ergebnisse",
          it: "Bassa fiducia nei risultati",
          pt: "Baixa confiança nos resultados",
          nl: "Laag vertrouwen in resultaten",
          ru: "Низкая уверенность в результатах",
          ja: "結果の信頼度が低いです",
          ko: "결과에 대한 신뢰도가 낮습니다",
          zh: "结果置信度较低"
        },
        highTokenUsage: {
          en: "High token usage detected",
          es: "Uso alto de tokens detectado",
          fr: "Utilisation élevée de jetons détectée",
          de: "Hohe Token-Nutzung erkannt",
          it: "Rilevato alto utilizzo di token",
          pt: "Alto uso de tokens detectado",
          nl: "Hoog tokengebruik gedetecteerd",
          ru: "Обнаружено высокое использование токенов",
          ja: "高いトークン使用量が検出されました",
          ko: "높은 토큰 사용량이 감지되었습니다",
          zh: "检测到高代币使用量"
        },
        successWithWarnings: {
          en: "Completed with warnings",
          es: "Completado con advertencias",
          fr: "Terminé avec des avertissements",
          de: "Mit Warnungen abgeschlossen",
          it: "Completato con avvisi",
          pt: "Concluído com avisos",
          nl: "Voltooid met waarschuwingen",
          ru: "Завершено с предупреждениями",
          ja: "警告付きで完了しました",
          ko: "경고와 함께 완료되었습니다",
          zh: "已完成但有警告"
        }
      },
      fieldLabels: {
        name: {
          en: "Name",
          es: "Nombre",
          fr: "Nom",
          de: "Name",
          it: "Nome",
          pt: "Nome",
          nl: "Naam",
          ru: "Имя",
          ja: "名前",
          ko: "이름",
          zh: "姓名"
        },
        email: {
          en: "Email",
          es: "Correo electrónico",
          fr: "E-mail",
          de: "E-Mail",
          it: "Email",
          pt: "E-mail",
          nl: "E-mail",
          ru: "Электронная почта",
          ja: "メール",
          ko: "이메일",
          zh: "电子邮件"
        },
        phone: {
          en: "Phone",
          es: "Teléfono",
          fr: "Téléphone",
          de: "Telefon",
          it: "Telefono",
          pt: "Telefone",
          nl: "Telefoon",
          ru: "Телефон",
          ja: "電話",
          ko: "전화",
          zh: "电话"
        },
        address: {
          en: "Address",
          es: "Dirección",
          fr: "Adresse",
          de: "Adresse",
          it: "Indirizzo",
          pt: "Endereço",
          nl: "Adres",
          ru: "Адрес",
          ja: "住所",
          ko: "주소",
          zh: "地址"
        },
        date: {
          en: "Date",
          es: "Fecha",
          fr: "Date",
          de: "Datum",
          it: "Data",
          pt: "Data",
          nl: "Datum",
          ru: "Дата",
          ja: "日付",
          ko: "날짜",
          zh: "日期"
        },
        amount: {
          en: "Amount",
          es: "Cantidad",
          fr: "Montant",
          de: "Betrag",
          it: "Importo",
          pt: "Quantia",
          nl: "Bedrag",
          ru: "Сумма",
          ja: "金額",
          ko: "금액",
          zh: "金额"
        },
        description: {
          en: "Description",
          es: "Descripción",
          fr: "Description",
          de: "Beschreibung",
          it: "Descrizione",
          pt: "Descrição",
          nl: "Beschrijving",
          ru: "Описание",
          ja: "説明",
          ko: "설명",
          zh: "描述"
        },
        priority: {
          en: "Priority",
          es: "Prioridad",
          fr: "Priorité",
          de: "Priorität",
          it: "Priorità",
          pt: "Prioridade",
          nl: "Prioriteit",
          ru: "Приоритет",
          ja: "優先度",
          ko: "우선순위",
          zh: "优先级"
        },
        status: {
          en: "Status",
          es: "Estado",
          fr: "Statut",
          de: "Status",
          it: "Stato",
          pt: "Status",
          nl: "Status",
          ru: "Статус",
          ja: "ステータス",
          ko: "상태",
          zh: "状态"
        },
        category: {
          en: "Category",
          es: "Categoría",
          fr: "Catégorie",
          de: "Kategorie",
          it: "Categoria",
          pt: "Categoria",
          nl: "Categorie",
          ru: "Категория",
          ja: "カテゴリ",
          ko: "카테고리",
          zh: "类别"
        }
      }
    };
  }
}

// Export singleton instance
export const localizationManager = new LocalizationManager();

// Helper functions
export function getLocalizedText(
  key: keyof PromptTranslations,
  subKey: string,
  language: string = 'en'
): string {
  return localizationManager.getText(key, subKey, language);
}

export function detectLanguageFromText(text: string): string {
  return localizationManager.detectLanguage(text);
}

export function formatLocalizedDate(date: Date, language: string = 'en'): string {
  return localizationManager.formatDate(date, language);
}

export function formatLocalizedNumber(
  number: number,
  language: string = 'en',
  style?: 'decimal' | 'currency' | 'percent'
): string {
  return localizationManager.formatNumber(number, language, style);
}

export function createLocalizedPrompt(
  basePrompt: string,
  context: {
    language: string;
    tone?: 'professional' | 'casual' | 'friendly' | 'formal';
    domain?: string;
    userInstructions?: string;
  }
): string {
  return localizationManager.createLocalizedPrompt(basePrompt, context);
}