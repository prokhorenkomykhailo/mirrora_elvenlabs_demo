import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import './App.css';

// Configure axios base URL for the hosted backend
axios.defaults.baseURL = 'https://elevenlabs-voice-server-295037490706.us-central1.run.app';

function App() {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [message, setMessage] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [conversation, setConversation] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [defaultContext, setDefaultContext] = useState("Your facial score is 100, - Hydration: 0.8 - Evenness: 0.6- Clarity: 0.7 - Smoothness: 0.5 - Glow: 0.9 - Dark Circles: 0.4. You are a helpful AI assistant with this information.");
  const [showConfig, setShowConfig] = useState(false);
  const audioRef = useRef(null);
  const recognitionRef = useRef(null);
  const websocketRef = useRef(null);

  useEffect(() => {
    // Initialize speech recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setMessage(transcript);
        handleVoiceMessage(transcript);
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        // Restart listening if session is active
        if (isConnected && sessionId) {
          setTimeout(() => {
            if (isConnected) {
              recognitionRef.current.start();
            }
          }, 1000);
        } else {
          setIsListening(false);
        }
      };
    }
  }, [isConnected, sessionId]);

  const startListening = async () => {
    if (recognitionRef.current) {
      try {
        // First, initialize voice session with context
        const initResponse = await axios.post('/api/voice/start', {
          voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel voice
          defaultContext: defaultContext
        });
        
        const sessionId = initResponse.data.sessionId;
        setSessionId(sessionId);
        
        // Add the initial AI message to conversation
        const initialMessage = {
          type: 'ai',
          text: initResponse.data.message,
          audio: initResponse.data.audio,
          timestamp: new Date()
        };
        setConversation(prev => [...prev, initialMessage]);
        
        // Play the initial audio
        if (initResponse.data.audio) {
          playAudio(initResponse.data.audio);
        }
        
        // Establish WebSocket connection
        await connectWebSocket(sessionId);
        
        // Start listening after a short delay
        setTimeout(() => {
          recognitionRef.current.start();
          setIsListening(true);
        }, 2000); // Wait for audio to finish
        
      } catch (error) {
        console.error('Error initializing voice session:', error);
        alert('Error: Could not start voice session');
      }
    } else {
      alert('Speech recognition not supported in this browser');
    }
  };

  const connectWebSocket = (sessionId) => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`wss://elevenlabs-voice-server-295037490706.us-central1.run.app/ws/${sessionId}`);
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        websocketRef.current = ws;
        
        // Send session start message
        ws.send(JSON.stringify({
          type: 'start-session',
          voiceId: '21m00Tcm4TlvDq8ikWAM'
        }));
        
        resolve();
      };
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'ai-response') {
          const aiMessage = {
            type: 'ai',
            text: data.message,
            audio: data.audio,
            timestamp: new Date()
          };
          setConversation(prev => [...prev, aiMessage]);
          setAiResponse(data.message);
          
          // Play the audio response
          if (data.audio) {
            playAudio(data.audio);
          }
          
          // Restart listening after audio finishes
          setTimeout(() => {
            if (isConnected && sessionId) {
              recognitionRef.current.start();
            }
          }, 2000);
        } else if (data.type === 'error') {
          console.error('WebSocket error:', data.message);
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };
      
      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        setSessionId(null);
        setIsListening(false);
      };
    });
  };

  const handleVoiceMessage = (text) => {
    if (!text.trim() || !isConnected || !websocketRef.current) return;
    
    // Add user message to conversation
    const userMessage = { type: 'user', text, timestamp: new Date() };
    setConversation(prev => [...prev, userMessage]);
    
    // Send message via WebSocket
    websocketRef.current.send(JSON.stringify({
      type: 'voice-message',
      message: text
    }));
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
    
    // Close WebSocket connection
    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }
    
    setIsConnected(false);
    setSessionId(null);
  };

  const handleSendMessage = async (text) => {
    if (!text.trim()) return;

    setIsProcessing(true);
    const userMessage = { type: 'user', text, timestamp: new Date() };
    setConversation(prev => [...prev, userMessage]);

    try {
      const response = await axios.post('/api/chat', {
        message: text,
        voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel voice
        defaultContext: defaultContext
      });

      const aiMessage = {
        type: 'ai',
        text: response.data.text,
        audio: response.data.audio,
        timestamp: new Date()
      };

      setConversation(prev => [...prev, aiMessage]);
      setAiResponse(response.data.text);
      
      // Play the audio response
      playAudio(response.data.audio);

    } catch (error) {
      console.error('Error sending message:', error);
      alert('Error: Could not get AI response');
    } finally {
      setIsProcessing(false);
      setMessage('');
    }
  };

  const playAudio = (audioBase64) => {
    if (audioRef.current) {
      const audioBlob = new Blob(
        [Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0))],
        { type: 'audio/mpeg' }
      );
      const audioUrl = URL.createObjectURL(audioBlob);
      audioRef.current.src = audioUrl;
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleTextSubmit = (e) => {
    e.preventDefault();
    handleSendMessage(message);
  };

  return (
    <div className="App">
      <div className="container">
        <header className="header">
          <h1>🎤 AI Voice Assistant</h1>
          <p>Powered by ElevenLabs & OpenAI</p>
          <button 
            className="config-btn"
            onClick={() => setShowConfig(!showConfig)}
          >
            ⚙️ {showConfig ? 'Hide' : 'Show'} Configuration
          </button>
        </header>

        {showConfig && (
          <div className="config-section">
            <h3>🔧 Configuration</h3>
            <div className="config-item">
              <label htmlFor="defaultContext">Default Context:</label>
              <textarea
                id="defaultContext"
                value={defaultContext}
                onChange={(e) => setDefaultContext(e.target.value)}
                placeholder="Enter the default context for AI conversations..."
                rows={3}
                className="context-input"
              />
              <p className="config-help">
                This context will be used when starting voice sessions and for chat messages.
              </p>
            </div>
          </div>
        )}

        <div className="chat-container">
          <div className="conversation">
            {conversation.length === 0 ? (
              <div className="empty-state">
                <p>👋 Ask me anything! Click the microphone or type your question.</p>
              </div>
            ) : (
              conversation.map((msg, index) => (
                <div key={index} className={`message ${msg.type}`}>
                  <div className="message-content">
                    <span className="message-text">{msg.text}</span>
                    <span className="message-time">
                      {msg.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))
            )}
            {isProcessing && (
              <div className="message ai">
                <div className="message-content">
                  <span className="message-text">🤔 Thinking...</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="controls">
          <form onSubmit={handleTextSubmit} className="input-form">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your question here..."
              className="text-input"
              disabled={isProcessing}
            />
            <button type="submit" className="send-btn" disabled={isProcessing || !message.trim()}>
              ➤
            </button>
          </form>

          <div className="voice-controls">
            <button
              className={`voice-btn ${isListening ? 'listening' : ''}`}
              onClick={isListening ? stopListening : startListening}
              disabled={isProcessing}
            >
              {isListening ? '🛑' : '🎤'}
            </button>
            <span className="voice-status">
              {isListening ? 'Listening...' : 'Click to speak'}
            </span>
          </div>
        </div>

        <audio
          ref={audioRef}
          onEnded={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          style={{ display: 'none' }}
        />
      </div>
    </div>
  );
}

export default App;
