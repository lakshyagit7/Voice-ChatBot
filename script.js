// script.js
// DOM Elements
const micBtn = document.getElementById('mic-btn');
const stopBtn = document.getElementById('stop-btn');
const chatContainer = document.getElementById('chat-container');
const apiKeyInput = document.getElementById('api-key-input');
const saveKeyBtn = document.getElementById('save-key-btn');
const keyStatus = document.getElementById('key-status');
const providerCards = document.querySelectorAll('.provider-card');
let recognition = null;
let currentProvider = 'openai'; // Default provider

// State management
const responseCache = {};
let lastRequestTime = 0;
const REQUEST_DELAY = 1500; // 1.5 seconds between requests

// Initialize the application
function init() {
    // Load saved settings
    loadSettings();
    
    // Initialize speech recognition
    initSpeechRecognition();
    
    // Set up event listeners
    setupEventListeners();
    
    // Show welcome message
    setTimeout(() => {
        addMessage("Hello! I'm your Home.LLC interview assistant. Ask me anything or try a sample question!", false);
        addMessage("Pro Tip: For best results, ask interview-related questions.", false);
        addMessage("Select your AI provider and enter API key to begin.", false);
    }, 1000);
}

// Load saved settings from localStorage
function loadSettings() {
    // API key
    if (localStorage.getItem('api_key')) {
        apiKeyInput.value = localStorage.getItem('api_key');
        keyStatus.textContent = 'API key saved';
        keyStatus.style.color = '#27ae60';
    }
    
    // Provider
    const savedProvider = localStorage.getItem('ai_provider');
    if (savedProvider) {
        currentProvider = savedProvider;
        updateProviderSelection();
    }
}

// Initialize speech recognition
function initSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window)) {
        alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
        micBtn.disabled = true;
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        document.body.classList.add('listening');
        micBtn.innerHTML = '<span>🔴</span> Listening...';
    };

    recognition.onresult = (event) => {
        if (event.results && event.results[0] && event.results[0][0]) {
            const transcript = event.results[0][0].transcript;
            micBtn.innerHTML = '<span>🎤</span> Start Speaking';
            document.body.classList.remove('listening');
            getAIResponse(transcript);
        } else {
            addMessage("I didn't catch that. Please try again.", false);
            micBtn.innerHTML = '<span>🎤</span> Start Speaking';
            document.body.classList.remove('listening');
        }
    };

    recognition.onerror = (event) => {
        let errorMsg = "Speech recognition error. Please try again.";
        if (event.error === 'not-allowed') {
            errorMsg = "Microphone access denied. Please enable microphone permissions.";
        } else if (event.error === 'no-speech') {
            errorMsg = "No speech detected. Please try again.";
        }
        addMessage(errorMsg, false);
        micBtn.innerHTML = '<span>🎤</span> Start Speaking';
        document.body.classList.remove('listening');
    };

    recognition.onend = () => {
        micBtn.innerHTML = '<span>🎤</span> Start Speaking';
        document.body.classList.remove('listening');
    };
}

// Set up event listeners
function setupEventListeners() {
    // Microphone button
    micBtn.addEventListener('click', () => {
        if (recognition) {
            recognition.start();
        }
    });
    
    // Stop button
    stopBtn.addEventListener('click', () => {
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
    });
    
    // Save API key button
    saveKeyBtn.addEventListener('click', saveApiKey);
    
    // Provider selection
    providerCards.forEach(card => {
        card.addEventListener('click', () => {
            currentProvider = card.dataset.provider;
            localStorage.setItem('ai_provider', currentProvider);
            updateProviderSelection();
            addMessage(`Switched to ${currentProvider === 'openai' ? 'OpenAI' : 'DeepSeek'} provider`, false);
        });
    });
    
    // Sample questions
    document.querySelectorAll('.sample-questions button').forEach(button => {
        button.addEventListener('click', (e) => {
            getAIResponse(e.target.dataset.question);
        });
    });
    
    // Keyboard shortcut for microphone (spacebar)
    document.addEventListener('keydown', (e) => {
        if (e.key === ' ' && e.target === document.body) {
            e.preventDefault();
            micBtn.click();
        }
    });
}

// Update provider selection UI
function updateProviderSelection() {
    providerCards.forEach(card => {
        if (card.dataset.provider === currentProvider) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    });
}

// Save API key to localStorage
function saveApiKey() {
    const key = apiKeyInput.value.trim();
    let isValid = false;
    
    if (currentProvider === 'openai') {
        isValid = key.startsWith('sk-') && key.length > 40;
    } else { // DeepSeek
        isValid = key.length > 20; // DeepSeek keys are long strings
    }
    
    if (isValid) {
        localStorage.setItem('api_key', key);
        keyStatus.textContent = 'API key saved successfully!';
        keyStatus.style.color = '#27ae60';
        addMessage("API key saved. You can now ask questions!", false);
    } else {
        keyStatus.textContent = 'Please enter a valid API key';
        keyStatus.style.color = '#e74c3c';
        addMessage("Invalid API key format. Please check and try again.", false);
    }
}

// Add message to chat
function addMessage(text, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', isUser ? 'user-message' : 'bot-message');
    messageDiv.textContent = text;
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    return messageDiv;
}

// Get AI response
async function getAIResponse(question) {
    // Check request timing
    const now = Date.now();
    if (now - lastRequestTime < REQUEST_DELAY) {
        addMessage("Please wait a moment before asking another question", false);
        return;
    }
    lastRequestTime = now;

    // Check for API key
    const apiKey = localStorage.getItem('api_key');
    if (!apiKey) {
        addMessage("Please enter and save your API key first.", false);
        return;
    }

    // Normalize question for caching
    const normalizedQuestion = question.toLowerCase().trim();
    
    // Check cache
    if (responseCache[normalizedQuestion]) {
        addMessage(question, true);
        addMessage(responseCache[normalizedQuestion], false);
        speakResponse(responseCache[normalizedQuestion]);
        return;
    }

    addMessage(question, true);
    const loadingMsg = addMessage("Thinking...", false);

    try {
        // Set API endpoint and model based on provider
        let apiUrl, model;
        
        if (currentProvider === 'openai') {
            apiUrl = 'https://api.openai.com/v1/chat/completions';
            model = 'gpt-3.5-turbo';
        } else { // DeepSeek
            apiUrl = 'https://api.deepseek.com/v1/chat/completions';
            model = 'deepseek-chat';
        }
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: "system",
                        content: `You are DeepSeek-R1 interviewing for Home.LLC. 
                        Answer professionally and concisely in 1-2 sentences.
                        If asked about non-interview topics (weather, sports, etc.),
                        politely redirect to interview questions.`
                    },
                    { role: "user", content: question }
                ],
                temperature: 0.7,
                max_tokens: 150
            })
        });

        // Handle API errors
        if (!response.ok) {
            const errorData = await response.json();
            let errorMsg = `API error: ${response.status}`;
            
            if (response.status === 429) {
                errorMsg = "Too many requests. Please wait before asking another question.";
            } else if (response.status === 401) {
                errorMsg = "Invalid API key. Please check and update your key.";
            } else if (errorData.error?.message) {
                errorMsg = errorData.error.message;
            }
            
            throw new Error(errorMsg);
        }

        // Process successful response
        const data = await response.json();
        const answer = data.choices[0].message.content;
        
        // Update UI and cache
        chatContainer.removeChild(loadingMsg);
        addMessage(answer, false);
        speakResponse(answer);
        
        // Add to cache
        responseCache[normalizedQuestion] = answer;
        
    } catch (error) {
        console.error("API Error:", error);
        if (chatContainer.contains(loadingMsg)) {
            chatContainer.removeChild(loadingMsg);
        }
        
        // Special handling for rate limits
        let errorMessage = error.message;
        if (error.message.includes('429')) {
            errorMessage = "I'm getting too many requests. Please wait a minute and try again.";
        }
        
        addMessage(`Sorry: ${errorMessage}`, false);
    }
}

// Speak response
function speakResponse(text) {
    if (!('speechSynthesis' in window)) {
        console.warn('Text-to-speech not supported');
        return;
    }

    // Cancel any ongoing speech
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }

    // Create and configure utterance
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    // Error handling
    utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event.error);
    };
    
    // Start speaking
    window.speechSynthesis.speak(utterance);
}

// Initialize the application when page loads
window.addEventListener('load', init);