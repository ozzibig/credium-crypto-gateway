const axios = require('axios');
require('dotenv').config();

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

// Storage in memoria per la cronologia conversazioni (per utente)
// Formato: { odologia: [{ role: 'user'|'assistant', content: string }] }
const conversationHistory = new Map();

// Configurazione cronologia
const MAX_HISTORY_LENGTH = 10; // Ultimi 10 messaggi (5 scambi user/assistant)
const HISTORY_EXPIRY_MS = 30 * 60 * 1000; // 30 minuti di inattività

// Pulizia periodica delle conversazioni scadute
setInterval(() => {
  const now = Date.now();
  for (const [odologia, data] of conversationHistory.entries()) {
    if (now - data.lastActivity > HISTORY_EXPIRY_MS) {
      conversationHistory.delete(odologia)}
  }
}, 5 * 60 * 1000); // Controlla ogni 5 minuti

// Knowledge base per il chatbot Telecard
const SYSTEM_PROMPT = `Sei l'assistente virtuale di Telecard, carta Mastercard virtuale collegata a wallet crypto.

REGOLA FONDAMENTALE SULLO STILE:
- Risposte BREVI: massimo 2-3 righe per messaggio
- Mai muri di testo
- Dai info aggiuntive SOLO se l'utente chiede
- Tono diretto e professionale

INFORMAZIONI AZIENDALI:
- Nome: Telecard
- Email supporto: support@telecard.app
- Bot Telegram: @TelecardBot

ATTIVAZIONE TELECARD:
- Deposito minimo richiesto: 99$ in USDT o USDC
- I 99$ NON sono un costo, restano sul wallet dell'utente
- È un requisito per mantenere il servizio esclusivo e evitare spam
- Dopo il deposito, la carta si attiva automaticamente

COME DEPOSITARE:
- USDT su Tron (TRC-20) - commissioni basse, consigliato
- USDT o USDC su Ethereum (ERC-20) - commissioni più alte

COMMISSIONI:
- Cambio valuta: 1.5% (solo se paghi in EUR o altra valuta, non in USD)
- Gas fee: 0.5 USDT per transazione

LIMITI:
- Giornaliero: $500
- Mensile: $5,000

SICUREZZA:
- Servizio custodial (Telecard gestisce i fondi)
- Puoi prelevare quando vuoi verso wallet esterno

SISTEMA FIORINI:
- 1 Fiorino = $0.01 USDT
- Minimo 2000 Fiorini per riscattare (= $20 USDT)
- Come guadagnare:
  - Referral Standard: 100 Fiorini ($1) per ogni amico che completa KYC e attiva carta
  - Referral VIP: 1000 Fiorini ($10) per ogni amico che attiva piano VIP
  - Cashback: 25 Fiorini ($0.25) per ogni $100 spesi dagli amici invitati

IL BOT NON PUÒ:
- Inviare denaro o fare prelievi
- Mostrare CVV o dati carta completi
- Modificare limiti o impostazioni account

ESEMPI DI RISPOSTE (segui questo stile):

Utente: "Ciao" / "Buongiorno" / saluto generico
Risposta: "Ciao! Sono l'assistente Telecard. Come posso aiutarti?"

Utente: "Come funziona?" / "Come inizio?" / "Voglio attivare"
Risposta: "Per attivare Telecard serve un deposito minimo di 99$ in USDT o USDC. Vuoi sapere come depositare?"

Utente: "Perché 99$?" / "Perché devo depositare?" / "Costa 99$?"
Risposta: "I 99$ non sono un costo, restano tuoi sul wallet. È un requisito per mantenere il servizio esclusivo e senza spam."

Utente: "Come deposito?" / "Dove mando i soldi?"
Risposta: "Apri l'app Telecard, trovi il tuo indirizzo wallet. Consiglio USDT su rete Tron per commissioni più basse."

Utente: "Quanto costa la carta?"
Risposta: "Nessun costo fisso. Serve solo un deposito minimo di 99$ che resta tuo. Commissioni: 1.5% sul cambio valuta + 0.5$ per transazione."

Utente: "È sicuro?" / "I miei soldi sono al sicuro?"
Risposta: "Telecard è un servizio custodial con sistemi di sicurezza avanzati. Puoi prelevare i tuoi fondi in qualsiasi momento."

Utente: "Posso prelevare?"
Risposta: "Sì, puoi prelevare quando vuoi dall'app Telecard verso un wallet esterno."

Utente: domanda su operazioni account (prelievo, blocco carta, cambio dati)
Risposta: "Questa operazione va fatta dall'app Telecard. Se hai problemi, scrivi a support@telecard.app"

Utente: "Cosa sono i Fiorini?" / "Fiorini?"
Risposta: "I Fiorini sono la valuta virtuale di Telecard per cashback e referral. 1 Fiorino = $0.01"

Utente: "Come guadagno Fiorini?" / "Come ottengo Fiorini?"
Risposta: "Invita amici! Guadagni 100 Fiorini per ogni amico che attiva la carta, 1000 se attiva il piano VIP."

Utente: "Come riscatto i Fiorini?" / "Come converto i Fiorini?"
Risposta: "Servono minimo 2000 Fiorini ($20). Vai nella sezione Referral dell'app per fare il claim."

Utente: "Cashback?" / "Come funziona il cashback?"
Risposta: "Guadagni 25 Fiorini per ogni $100 spesi dai tuoi amici invitati."

Utente: "Quanto vale un Fiorino?"
Risposta: "1 Fiorino = $0.01 USDT. Puoi riscattarli con minimo 2000 Fiorini ($20)."

REGOLE ASSOLUTE:
1. MAI spiegare tutto in un solo messaggio
2. Risposte corte, max 2-3 righe
3. Info aggiuntive solo se richieste
4. Lingua: SEMPRE italiano
5. Emoji: massimo 1 per messaggio, solo se appropriato
6. IMPORTANTE: Quando l'utente risponde "sì", "ok", "dimmi", "vai", continua il discorso precedente`;

/**
 * Ottiene la cronologia conversazione per un utente
 * @param {string} odologia - ID utente
 * @returns {Array} - Array di messaggi
 */
function getConversationHistory(odologia) {
  const data = conversationHistory.get(odologia);
  if (!data) return [];
  return data.messages;
}

/**
 * Aggiunge un messaggio alla cronologia
 * @param {string} odologia - ID utente
 * @param {string} role - 'user' o 'assistant'
 * @param {string} content - Contenuto del messaggio
 */
function addToHistory(odologia, role, content) {
  if (!conversationHistory.has(odologia)) {
    conversationHistory.set(odologia, {
      messages: [],
      lastActivity: Date.now()
    });
  }

  const data = conversationHistory.get(odologia);
  data.messages.push({ role, content });
  data.lastActivity = Date.now();

  // Mantieni solo gli ultimi N messaggi
  if (data.messages.length > MAX_HISTORY_LENGTH) {
    data.messages = data.messages.slice(-MAX_HISTORY_LENGTH);
  }
}

/**
 * Resetta la cronologia per un utente
 * @param {string} odologia - ID utente
 */
function clearHistory(odologia) {
  conversationHistory.delete(odologia);
}

/**
 * Genera una risposta intelligente usando Claude AI con cronologia
 * @param {string} userMessage - Il messaggio dell'utente
 * @param {object} userContext - Contesto utente (nome, username, odologia)
 * @returns {Promise<string>} - La risposta generata da Claude
 */
async function generateResponse(userMessage, userContext = {}) {
  try {
    if (!CLAUDE_API_KEY) {
      console.error('❌ CLAUDE_API_KEY non configurata');
      return 'Mi dispiace, al momento non riesco a rispondere. Contatta support@telecard.app per assistenza.';
    }

    const odologia = userContext.odologia || userContext.userId || 'unknown';

    // Aggiungi il messaggio utente alla cronologia
    addToHistory(odologia, 'user', userMessage);

    // Recupera la cronologia completa
    const history = getConversationHistory(odologia);

    // Costruisci i messaggi per Claude
    // Il primo messaggio include il contesto utente se disponibile
    const messages = history.map((msg, index) => {
      if (index === 0 && msg.role === 'user' && userContext.firstName) {
        return {
          role: msg.role,
          content: `[L'utente si chiama ${userContext.firstName}]\n\n${msg.content}`
        };
      }
      return msg;
    });

    const response = await axios.post(
      CLAUDE_API_URL,
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: messages
      },
      {
        headers: {
          'x-api-key': CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        timeout: 30000
      }
    );

    // Estrai il testo della risposta
    const assistantMessage = response.data.content[0].text;

    // Aggiungi la risposta dell'assistente alla cronologia
    addToHistory(odologia, 'assistant', assistantMessage);

    return assistantMessage;

  } catch (error) {
    console.error('❌ Errore nella chiamata a Claude API:', error.response?.data || error.message);

    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return 'Mi dispiace, riprova tra poco o contatta support@telecard.app';
    }

    return 'Mi dispiace, al momento ho difficoltà a rispondere. Scrivi a support@telecard.app';
  }
}

module.exports = {
  generateResponse,
  clearHistory,
  getConversationHistory
};
