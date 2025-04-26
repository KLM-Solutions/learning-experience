"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Button } from "@/app/components/ui/button"
import {
  Mic,
  Keyboard,
  Send,
  X,
  Volume2,
  VolumeX,
  ChevronLeft,
  MessageSquare,
  AlertCircle,
  RefreshCw,
  Loader,
  Home as HomeIcon, 
} from "lucide-react"
import { Avatar } from "@/app/components/ui/avatar"
import { Textarea } from "@/app/components/ui/textarea"
import { motion, AnimatePresence } from "framer-motion"
import { useChat } from "ai/react"
import type { LearningMode, Reference } from "./types"
import { SpeechControls } from "@/app/components/speech-controls"
import Image from "next/image"
import { Switch } from "@/app/components/ui/switch" 
import { Label } from "@/app/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert"
import ReactMarkdown from "react-markdown"

// Define the message structure
interface Message {
  id: string
  content: string
  sender: "user" | "system"
  references?: Reference[]
  role: "user" | "assistant"
}

// Define VoiceRecorderProps interface
interface VoiceRecorderProps {
  onTranscription: (text: string) => void;
  disabled?: boolean;
}

// This function splits a text into chunks based on natural breakpoints
// to improve the flow and quality of text-to-speech output
const chunkResponse = (text: string, chunkSize: number = 200) => {
  // Remove ** and # symbols from the text
  const sanitizedText = text.replace(/[\*\#]/g, '');

  // Split by natural breakpoints (periods followed by space, question marks, exclamation points)
  const sentences = sanitizedText.match(/[^.!?]+[.!?]+\s*/g) || [];
  
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    // If adding this sentence would exceed the limit, start a new chunk
    if ((currentChunk + sentence).length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }
  
  // Add the final chunk if there's anything left
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  // If we have no chunks (maybe the input had no proper sentences),
  // fall back to word-based chunking
  if (chunks.length === 0) {
    const words = sanitizedText.split(' ');
    currentChunk = '';
    
    for (const word of words) {
      if ((currentChunk + ' ' + word).length <= chunkSize || currentChunk.length === 0) {
        currentChunk += (currentChunk ? ' ' : '') + word;
      } else {
        chunks.push(currentChunk);
        currentChunk = word;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk);
    }
  }
  
  return chunks;
};

// TTS Control component
const TTSControls = ({ messageContent, messageId, isEnabled = true, audioChunks = [], isCurrentlyReading = false, onStopReading = () => {} }: { messageContent: string, messageId: string, isEnabled: boolean, audioChunks: string[], isCurrentlyReading: boolean, onStopReading: () => void }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Use provided audioChunks or generate them if not provided
  const [chunks, setChunks] = useState(audioChunks);
  
  useEffect(() => {
    // If audioChunks were not provided, generate them
    if (audioChunks.length === 0) {
      const newChunks = chunkResponse(messageContent);
      setChunks(newChunks);
    } else {
      setChunks(audioChunks);
    }
  }, [messageContent, audioChunks]);
  
  // Effect to auto-start reading when isCurrentlyReading changes
  useEffect(() => {
    if (isCurrentlyReading && !isPlaying && !isLoading) {
      togglePlayback();
    }
  }, [isCurrentlyReading]);
  
  const playNextChunk = async (chunkIndex: number) => {
    if (chunkIndex >= chunks.length) {
      setIsPlaying(false);
      setCurrentChunkIndex(0);
      return;
    }

    try {
      const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/Z5A0ZMhOWwL3m0q2Yo1P/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': 'sk_92abd11707faa16905cdcba5849819cd5b380993a19c10fc',
        },
        body: JSON.stringify({
          text: chunks[chunkIndex],
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5
          }
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate audio');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      if (audioRef.current) {
        (audioRef.current as HTMLAudioElement).src = audioUrl;
        (audioRef.current as HTMLAudioElement).onended = () => {
          URL.revokeObjectURL(audioUrl);
          setCurrentChunkIndex(chunkIndex + 1);
          playNextChunk(chunkIndex + 1);
        };
        (audioRef.current as HTMLAudioElement).play();
      }
    } catch (err) {
      console.error('TTS Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to play audio');
      setIsPlaying(false);
    }
  };
  
  const stopPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      if (audioRef.current.src) {
        URL.revokeObjectURL(audioRef.current.src);
      }
    }
    setIsPlaying(false);
    setCurrentChunkIndex(0);
    onStopReading(); // Call the onStopReading callback
  };
  
  const togglePlayback = async () => {
    if (isLoading || !isEnabled) return;

    if (isPlaying) {
      stopPlayback();
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setIsPlaying(true);
      await playNextChunk(0);
    } catch (err) {
      console.error('TTS Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to play audio');
      setIsPlaying(false);
      onStopReading(); // Call the onStopReading callback in case of error
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    return () => {
      if (isPlaying) {
        stopPlayback();
      }
    };
  }, []);
  
  return (
    <div className="flex items-center space-x-2">
      <button
        onClick={togglePlayback}
        disabled={isLoading}
        className={`p-2 rounded-full transition-colors ${
          isPlaying ? 'bg-blue-500 text-white' : 'bg-blue-100 text-blue-500'
        } hover:bg-opacity-90 disabled:opacity-50`}
        title={isPlaying ? 'Stop' : 'Play'}
      >
        {isLoading ? (
          <Loader className="w-4 h-4 animate-spin" />
        ) : isPlaying ? (
          <VolumeX className="w-4 h-4" />
        ) : (
          <Volume2 className="w-4 h-4" />
        )}
      </button>
      
      {error && (
        <span className="text-xs text-red-500">Failed to play audio</span>
      )}
      
      <audio
        ref={audioRef}
        onError={(e) => {
          console.error('Audio error:', e);
          setError('Audio playback failed');
          setIsPlaying(false);
          onStopReading(); // Call the onStopReading callback in case of error
        }}
        onEnded={() => {
          if (currentChunkIndex >= chunks.length - 1) {
            onStopReading(); // Call onStopReading when all chunks have finished playing
          }
        }}
      />
    </div>
  );
};

// Update MessageBubble to pass the right props to TTSControls
const MessageBubble = ({ id, content, role, isCurrentlyReading, onReadMessage, onStopReading }: { id: string, content: string, role: string, isCurrentlyReading: boolean, onReadMessage: () => void, onStopReading: () => void }) => {
  // Create audio chunks for each message
  const [audioChunks, setAudioChunks] = useState<string[]>([]);
  
  useEffect(() => {
    // Create audio chunks when the component mounts
    const chunks = chunkResponse(content);
    setAudioChunks(chunks);
  }, [content]);
  
  return (
    <div className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'} mb-4`}>
      {role === 'assistant' && (
        <div className="flex items-start mb-4">
          <div className="mr-2 flex-shrink-0">
            <Image 
              src="/diana.png" 
              alt="Assistant" 
              width={40} 
              height={40} 
              className="rounded-full"
            />
          </div>
          <div className="flex-1 bg-blue-50 rounded-lg p-4">
            <div className="mb-2">
              <TTSControls 
                messageContent={content} 
                messageId={id}
                isEnabled={true}
                audioChunks={audioChunks}
                isCurrentlyReading={isCurrentlyReading}
                onStopReading={onStopReading}
              />
            </div>
            
            <div className="prose prose-lg max-w-none space-y-4 markdown-custom">
              <ReactMarkdown components={{
                p: ({ node, ...props }) => {
                  // Process content to handle vertical bars
                  const content = typeof props.children === 'string' 
                    ? props.children 
                    : Array.isArray(props.children) 
                      ? props.children.map(child => 
                          typeof child === 'string' 
                            ? child 
                            : child?.props?.children || ''
                        ).join('') 
                      : '';
                  
                  if (content.includes('|')) {
                    // Split by lines first
                    const lines = content.split('\n');
                    
                    // Check if this looks like a markdown table (has multiple lines with vertical bars)
                    const tableLines = lines.filter(line => line.includes('|'));
                    if (tableLines.length > 1) {
                      // Process as a table
                      return (
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200 border">
                            <tbody>
                              {tableLines.map((line, lineIndex) => {
                                // Skip separator lines (like |---|---|)
                                if (line.replace(/\|/g, '').trim().replace(/[-:]/g, '') === '') {
                                  return null;
                                }
                                
                                // Split the line by vertical bars and remove empty first/last cells
                                const cells = line.split('|').filter(cell => cell !== '');
                                
                                return (
                                  <tr key={lineIndex} className={lineIndex === 0 ? "bg-gray-50" : "border-t"}>
                                    {cells.map((cellContent, cellIndex) => {
                                      // Process markdown formatting within cells (like **bold**)
                                      const processedContent = cellContent.trim().replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                                      
                                      return (
                                        <td 
                                          key={cellIndex} 
                                          className="px-4 py-2 border-r last:border-r-0"
                                          dangerouslySetInnerHTML={{ __html: processedContent }}
                                        />
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    } else {
                      // Single line with vertical bars - render as regular text
                      return (
                        <div>
                          {lines.map((line, lineIndex) => (
                            <p key={lineIndex}>{line}</p>
                          ))}
                        </div>
                      );
                    }
                  }
                  // Default paragraph rendering for content without vertical bars
                  return <p {...props} />;
                }
              }}>
                {content}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
      
      {role === 'user' && (
        <Avatar className="ml-2">
          <div className="bg-green-500 w-full h-full flex items-center justify-center text-white">You</div>
        </Avatar>
      )}
    </div>
  );
};

// Replace the existing VoiceRecorder component with this improved one
const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onTranscription, disabled }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcript, setTranscript] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const lottiePlayerRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@lottiefiles/lottie-player@2.0.8/dist/lottie-player.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices || !window.MediaRecorder) {
        throw new Error('Browser does not support voice recording. Please use Chrome, Firefox, or Edge.');
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 44100,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });
      
      streamRef.current = stream;

      const mimeTypes = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav'];
      let mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || '';
      
      if (!mimeType) {
        throw new Error('No supported audio format found');
      }

      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000
      });

      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        try {
          const audioBlob = new Blob(chunksRef.current, { type: mimeType });
          await processAudio(audioBlob);
        } catch (err) {
          console.error('Error processing audio:', err);
          setError('Failed to process audio');
        } finally {
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }
        }
      };

      mediaRecorderRef.current.start(100);
      setIsRecording(true);
      setError(null);

      if (lottiePlayerRef.current) {
        lottiePlayerRef.current.play();
      }
    } catch (err) {
      console.error('Error starting recording:', err);
      setError(err instanceof Error ? err.message : 'Failed to start recording');
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
        if (lottiePlayerRef.current) {
          lottiePlayerRef.current.pause();
          lottiePlayerRef.current.currentTime = 0;
        }
      } catch (err) {
        console.error('Error stopping recording:', err);
        setError('Failed to stop recording');
      }
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob);

      const response = await fetch('/api/stt', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process audio');
      }

      const data = await response.json();
      if (data.text) {
        setTranscript(data.text);
        
        // Automatically pass the text to the parent component
        // This will trigger the API call in the parent component
        onTranscription(data.text);
      }
    } catch (err) {
      console.error('Error processing audio:', err);
      setError(err instanceof Error ? err.message : 'Failed to process audio');
    } finally {
      setIsProcessing(false);
    }
  };

  // Add timer effect to update recording time
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      setRecordingTime(0);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      setIsRecording(false);
      setIsProcessing(false);
    };
  }, []);

  return (
    <div className="flex items-center space-x-2">
      {isRecording && (
        <div className="flex items-center bg-red-100 px-2 py-1 rounded-full">
          <div className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></div>
          <span className="text-xs font-medium">{formatTime(recordingTime)}</span>
        </div>
      )}
      <button
        onClick={isRecording ? stopRecording : startRecording}
        disabled={disabled || isProcessing}
        className={`p-2 rounded-full transition-all duration-200 ${
          isRecording ? 'bg-transparent scale-125' : 'bg-gray-100'
        } hover:bg-opacity-90 disabled:opacity-50 relative`}
        title={isRecording ? 'Stop Recording' : 'Start Recording'}
        type="button"
      >
        {isProcessing ? (
          <Loader className="w-4 h-4 animate-spin text-gray-600" />
        ) : isRecording ? (
          <div 
            className="relative w-12 h-12 flex items-center justify-center cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isRecording && !isProcessing) {
                stopRecording();
              }
            }}
          >
            {/* Recording waves animation */}
            <div className="absolute inset-0">
              <div className="recording-wave"></div>
              <div className="recording-wave delay-150"></div>
              <div className="recording-wave delay-300"></div>
            </div>
            <div className="audio-visualizer">
              <div className="bar"></div>
              <div className="bar"></div>
              <div className="bar"></div>
              <div className="bar"></div>
              <div className="bar"></div>
              <div className="bar"></div>
              <div className="bar"></div>
              <div className="bar"></div>
            </div>
          </div>
        ) : (
          <Mic className="w-4 h-4 text-gray-600" />
        )}
      </button>
      
      {transcript && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg max-w-md">
          <p className="text-sm font-medium">{transcript}</p>
        </div>
      )}
      
      {error && (
        <span className="text-xs text-red-500">{error}</span>
      )}
    </div>
  );
};

export default function Home() {
  const [selectedMode, setSelectedMode] = useState<LearningMode>(null)
  const [inputMethod, setInputMethod] = useState<"none" | "mic" | "keyboard">("none")
  const [inputText, setInputText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [autoRead, setAutoRead] = useState(false)
  const [currentlyReadingId, setCurrentlyReadingId] = useState<string | null>(null)
  const lastMessageRef = useRef<string | null>(null)
  const [initialMessageSent, setInitialMessageSent] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const formRef = useRef<HTMLFormElement | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [hoveredCard, setHoveredCard] = useState<LearningMode | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  // Add refs for each card
  const predesignedCardRef = useRef<HTMLDivElement>(null);
  const brandnewCardRef = useRef<HTMLDivElement>(null);
  const customizedCardRef = useRef<HTMLDivElement>(null);
  const reviewCardRef = useRef<HTMLDivElement>(null);

  // Get the target ref based on which card is hovered
  const getTargetCardRef = (hoveredCard: LearningMode) => {
    switch (hoveredCard) {
      case "predesigned": return brandnewCardRef;
      case "brandnew": return predesignedCardRef;
      case "customized": return reviewCardRef;
      case "review": return customizedCardRef;
      default: return null;
    }
  };

  // Function to get initial message based on selected mode
  const getInitialMessage = (mode: LearningMode): string => {
    switch (mode) {
      case "predesigned":
        return "I'll guide you through a pre-designed feedback scenario. This is a structured exercise where you'll practice giving compassionate feedback in a common workplace situation. Ready to begin?"
      case "brandnew":
        return "Let's create a brand-new feedback scenario for you to practice. I'll generate a realistic situation, and you can jump right in to practice giving feedback. What type of workplace or relationship would you like to focus on?"
      case "customized":
        return "Let's work together to create a customized feedback scenario. Tell me about a specific situation you're facing or would like to practice, and I'll help you craft an effective, compassionate approach."
      case "review":
        return "Let's review key concepts related to compassionate feedback. I can explain principles, frameworks, and techniques that make feedback more effective and well-received. What specific aspect of compassionate feedback would you like to explore first?"
      default:
        return ""
    }
  }

  // Use the AI SDK's useChat hook
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit: submitChat,
    isLoading: chatIsLoading,
    error: chatError,
    reload,
    setMessages
  } = useChat({
    api: "/api/chat",
    body: { mode: selectedMode },
    initialMessages: [],
    onError: (err) => {
      console.error("Chat error:", err)
      setError(`Failed to connect to AI: ${err.message || "Unknown error"}`)
    },
    onFinish: () => {
      // Simplified onFinish handler
    },
  })

  // Effect to send initial message when mode is selected, with a delay
  useEffect(() => {
    if (selectedMode && !initialMessageSent && messages.length === 0) {
      // Set loading state to true
      setIsLoading(true);
      
      // Wait for 3 seconds before showing the initial message
      const timer = setTimeout(() => {
        const initialMessage = getInitialMessage(selectedMode);
        if (initialMessage) {
          // Add the assistant message directly to the chat
          setMessages([
            {
              id: `assistant-initial-${selectedMode}`,
              content: initialMessage,
              role: "assistant"
            }
          ]);
          setInitialMessageSent(true);
        }
        // End loading state
        setIsLoading(false);
      }, 3000); // 3 second delay
      
      return () => clearTimeout(timer);
    }
  }, [selectedMode, initialMessageSent, messages.length, setMessages]);

  // Reset initialMessageSent when going back to selection screen
  useEffect(() => {
    if (selectedMode === null) {
      setInitialMessageSent(false);
      setIsLoading(false);
    }
  }, [selectedMode]);

  // Handle retry - simplified
  const handleRetry = () => {
    setError(null)
    if (messages.length > 0) {
      reload()
    }
  }

  // Handle card selection
  const handleCardSelect = (mode: LearningMode) => {
    console.log("Card selected:", mode)
    setSelectedMode(mode)
    setError(null)
  }

  // Create a custom submit handler that prevents default behavior
  const handleSubmitInput = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); // This prevents the page refresh
    
    if (!input.trim()) return;
    
    // Submit the message using the AI SDK
    submitChat(e, {
      data: { message: input },
    });
    
    // Close the text area by resetting the input method
    setInputMethod("none");
  };

  // Get mode title
  const getModeTitle = () => {
    switch (selectedMode) {
      case "predesigned":
        return "Pre-designed Feedback Scenario"
      case "brandnew":
        return "Brand-new Feedback Scenario"
      case "customized":
        return "Customized Feedback Scenario"
      case "review":
        return "Feedback Concepts Review"
      default:
        return ""
    }
  }

  // Get mode icon
  const getModeIcon = () => {
    switch (selectedMode) {
      case "predesigned":
        return "./pre-designed-feedback.png"
      case "brandnew":
        return "./brand-new-scenario.png"
      case "customized":
        return "./customized-scenario.png"
      case "review":
        return "./review-key-concepts.png"
      default:
        return "./placeholder.svg"
    }
  }

  // Function to stop reading any currently playing audio
  const stopReading = () => {
    setCurrentlyReadingId(null);
    // This will be used by the MessageBubble to stop playback
  }

  // Effect to auto-read the last assistant message when streaming completes
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    
    // Check if we have a new message from assistant that's different from what we've seen
    if (
      lastMessage && 
      lastMessage.role === 'assistant' && 
      lastMessage.id !== lastMessageRef.current &&
      !chatIsLoading // Only trigger when streaming is complete
    ) {
      lastMessageRef.current = lastMessage.id;
      
      // If auto-read is enabled, start reading the new message
      if (autoRead) {
        // Small delay to ensure UI is updated
        setTimeout(() => {
          setCurrentlyReadingId(lastMessage.id);
        }, 500);
      }
    }
  }, [messages, chatIsLoading, autoRead]);

  const handleTranscription = (text: string) => {
    // First set the text in the input area (for display purposes)
    handleInputChange({
      target: { value: text }
    } as React.ChangeEvent<HTMLTextAreaElement>);
    
    // Focus on the input area
    if (formRef.current) {
      const textarea = formRef.current.querySelector('textarea');
      if (textarea) {
        textarea.focus();
      }
    }
    
    // Optional: Close the microphone modal if you're using one
    setInputMethod("keyboard");
  };

  // Function to get video source based on card type
  const getVideoSource = (mode: LearningMode): string => {
    switch (mode) {
      case "predesigned":
        return "/Predesigned.mp4"
      case "brandnew":
        return "/Brandnew.mp4"
      case "customized":
        return "/Customized.mp4"
      case "review":
        return "/Review.mp4"
      default:
        return "/videos/dummy-video.mp4"
    }
  }
  
  // Function to handle mouse enter on card
  const handleCardMouseEnter = (mode: LearningMode) => {
    setHoveredCard(mode);
    setShowTooltip(true);
  }
  
  // Function to handle mouse leave on card
  const handleCardMouseLeave = () => {
    setShowTooltip(false);
    // Small delay before removing the hovered card to allow for smooth transitions
    setTimeout(() => {
      if (!showTooltip) {
        setHoveredCard(null);
      }
    }, 300);
  }

  // Add these functions before the return statement
  const startRecording = async () => {
    setIsRecording(true);
    // Implement your recording logic here
  };

  const stopRecording = () => {
    setIsRecording(false);
    // Implement your stop recording logic here
  };

  return (
    <div className="min-h-screen w-full overflow-y-auto">
      <AnimatePresence mode="wait">
        {selectedMode === null ? (
          <motion.main
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex min-h-screen flex-col items-center justify-center p-4 md:p-24 bg-gradient-to-b from-gray-50 to-gray-100"
          >
            <div className="w-full max-w-5xl">
              <motion.h1
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-4xl font-bold mb-8 text-center bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent"
              >
                Welcome to Today's Learning Experience 👋
              </motion.h1>

              {error && (
                <Alert variant="destructive" className="mb-6">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Card 1: Pre-designed Scenario */}
                <motion.div
                  ref={predesignedCardRef}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  whileHover={{ scale: 1.05, boxShadow: "0px 10px 20px rgba(0, 0, 0, 0.1)" }}
                  onMouseEnter={() => handleCardMouseEnter("predesigned")}
                  onMouseLeave={handleCardMouseLeave}
                >
                  <Card
                    className="cursor-pointer h-full overflow-hidden border-0 shadow-lg"
                    onClick={() => handleCardSelect("predesigned")}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle>Pre-designed Feedback Scenario</CardTitle>
                      <CardDescription>Start with a structured feedback exercise</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="h-64 w-full relative overflow-hidden">
                        <Image
                          src="/pre-designed-feedback.png"
                          alt="Pre-designed feedback scenario illustration showing two people discussing feedback"
                          fill
                          style={{ objectFit: "cover" }}
                          className="transition-transform duration-300 group-hover:scale-105"
                        />
                      </div>
                    </CardContent>
                    <CardFooter className="bg-gradient-to-r from-blue-50 to-blue-100">
                      <Button className="w-full bg-blue-600 hover:bg-blue-700">Start Scenario</Button>
                    </CardFooter>
                  </Card>
                </motion.div>

                {/* Card 2: Brand-new Scenario */}
                <motion.div
                  ref={brandnewCardRef}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  whileHover={{ scale: 1.05, boxShadow: "0px 10px 20px rgba(0, 0, 0, 0.1)" }}
                  onMouseEnter={() => handleCardMouseEnter("brandnew")}
                  onMouseLeave={handleCardMouseLeave}
                >
                  <Card
                    className="cursor-pointer h-full overflow-hidden border-0 shadow-lg"
                    onClick={() => handleCardSelect("brandnew")}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle>Brand-New Scenario</CardTitle>
                      <CardDescription>Create a new scenario and jump right in</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="h-64 w-full relative overflow-hidden">
                        <Image
                          src="/brand-new-scenario.png"
                          alt="Illustration of people creating a brand new feedback scenario with a lightbulb idea"
                          fill
                          style={{ objectFit: "cover" }}
                          className="transition-transform duration-300 group-hover:scale-105"
                        />
                      </div>
                    </CardContent>
                    <CardFooter className="bg-gradient-to-r from-green-50 to-green-100">
                      <Button className="w-full bg-green-600 hover:bg-green-700">Create & Start</Button>
                    </CardFooter>
                  </Card>
                </motion.div>

                {/* Card 3: Customized Scenario */}
                <motion.div
                  ref={customizedCardRef}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  whileHover={{ scale: 1.05, boxShadow: "0px 10px 20px rgba(0, 0, 0, 0.1)" }}
                  onMouseEnter={() => handleCardMouseEnter("customized")}
                  onMouseLeave={handleCardMouseLeave}
                >
                  <Card
                    className="cursor-pointer h-full overflow-hidden border-0 shadow-lg"
                    onClick={() => handleCardSelect("customized")}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle>Customized Scenario</CardTitle>
                      <CardDescription>Create a personalized scenario together</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="h-64 w-full relative overflow-hidden">
                        <Image
                          src="/customized-scenario.png"
                          alt="Illustration of people collaboratively creating a customized feedback scenario"
                          fill
                          style={{ objectFit: "cover" }}
                          className="transition-transform duration-300 group-hover:scale-105"
                        />
                      </div>
                    </CardContent>
                    <CardFooter className="bg-gradient-to-r from-purple-50 to-purple-100">
                      <Button className="w-full bg-purple-600 hover:bg-purple-700">Customize</Button>
                    </CardFooter>
                  </Card>
                </motion.div>

                {/* Card 4: Review Key Concepts */}
                <motion.div
                  ref={reviewCardRef}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  whileHover={{ scale: 1.05, boxShadow: "0px 10px 20px rgba(0, 0, 0, 0.1)" }}
                  onMouseEnter={() => handleCardMouseEnter("review")}
                  onMouseLeave={handleCardMouseLeave}
                >
                  <Card
                    className="cursor-pointer h-full overflow-hidden border-0 shadow-lg"
                    onClick={() => handleCardSelect("review")}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle>Review Key Concepts</CardTitle>
                      <CardDescription>Learn about compassionate feedback principles</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="h-64 w-full relative overflow-hidden">
                        <Image
                          src="/review-key-concepts.png"
                          alt="Illustration of person explaining key concepts of compassionate feedback"
                          fill
                          style={{ objectFit: "cover" }}
                          className="transition-transform duration-300 group-hover:scale-105"
                        />
                      </div>
                    </CardContent>
                    <CardFooter className="bg-gradient-to-r from-amber-50 to-amber-100">
                      <Button className="w-full bg-amber-600 hover:bg-amber-700">Review</Button>
                    </CardFooter>
                  </Card>
                </motion.div>
              </div>
            </div>
          </motion.main>
        ) : (
          <motion.div
            key="scenario"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full flex flex-col h-screen max-h-screen bg-white overflow-hidden"
          >
            {/* App Header */}
            <header className="bg-white border-b border-gray-200 p-4 flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    window.location.reload()
                  }}
                  className="text-gray-700 hidden md:flex"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
                <div className="flex items-center space-x-2">
                  <Image
                    src={getModeIcon()}
                    alt={getModeTitle()}
                    width={24}
                    height={24}
                    className="rounded"
                  />
                  <h1 className="text-lg font-medium text-gray-900">{getModeTitle()}</h1>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                {/* Auto-read toggle */}
                <div className="flex items-center space-x-2">
                  <Switch
                    id="auto-read"
                    checked={autoRead}
                    onCheckedChange={setAutoRead}
                    onClick={() => {
                      if (autoRead) {
                        // If turning off, stop any reading in progress
                        stopReading();
                      }
                    }}
                  />
                  <Label htmlFor="auto-read" className="text-sm">Auto-Read</Label>
                </div>
                
                {/* Home button - now placed after Auto-Read */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    window.location.reload()
                  }}
                  className="text-gray-700"
                >
                  <HomeIcon className="h-4 w-4 mr-1" />
                  Home
                </Button>
              </div>
            </header>

            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="max-w-4xl mx-auto">
                {error && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {messages.length === 0 || isLoading ? (
                  <div className="flex flex-col items-center justify-center h-full min-h-[calc(100vh-200px)]">
                    {/* Display the mode icon during loading */}
                    <div className="w-24 h-24 mb-6">
                      <Image
                        src={getModeIcon()}
                        alt={getModeTitle()}
                        width={96}
                        height={96}
                        className="rounded object-contain"
                      />
                    </div>
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                      <MessageSquare className="h-8 w-8 text-blue-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">Starting conversation...</h2>
                    <p className="text-center text-gray-500 max-w-md mb-6">
                      The AI assistant is preparing your {selectedMode} scenario
                    </p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      id={message.id}
                      content={message.content}
                      role={message.role as "user" | "assistant"}
                      isCurrentlyReading={message.id === currentlyReadingId}
                      onReadMessage={() => setCurrentlyReadingId(message.id)}
                      onStopReading={stopReading}
                    />
                  ))
                )}
              </div>
            </div>
            
            {/* Input method buttons */}
            <div className="relative">
              {inputMethod === "none" && (
                <div className="fixed bottom-8 right-8 flex flex-col space-y-2">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.2 }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Button
                      size="icon"
                      className="rounded-full w-14 h-14 bg-blue-500 hover:bg-blue-600 shadow-lg"
                      onClick={() => setInputMethod("keyboard")}
                    >
                      <Keyboard className="h-6 w-6" />
                    </Button>
                  </motion.div>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.2, delay: 0.1 }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Button
                      size="icon"
                      className={`
                        rounded-full w-14 h-14 
                        ${isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'} 
                        shadow-lg flex items-center justify-center
                      `}
                      onClick={() => isRecording ? stopRecording() : startRecording()}
                    >
                      {isProcessing ? (
                        <Loader className="h-6 w-6 animate-spin" />
                      ) : (
                        <Mic className="h-6 w-6 text-white" />
                      )}
                    </Button>
                  </motion.div>
                </div>
              )}

              {/* Keyboard input overlay */}
              {inputMethod === "keyboard" && (
                <motion.div
                  className="fixed inset-0 bg-transparent flex items-end justify-center z-50"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  <motion.div
                    className="w-full bg-transparent backdrop-blur-sm border border-gray-200 rounded-t-xl"
                    initial={{ y: 100 }}
                    animate={{ y: 0 }}
                    transition={{ duration: 0.3, type: "spring" }}
                  >
                    <div className="max-w-4xl mx-auto px-4 py-4 bg-transparent">
                      <div className="flex justify-between items-center mb-4 bg-transparent">
                        <h3 className="font-medium flex items-center text-gray-700">
                          <MessageSquare className="h-5 w-5 mr-2 text-blue-400" />
                          Type your message
                        </h3>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-full hover:bg-gray-100/20 text-gray-500 bg-transparent"
                          onClick={() => setInputMethod("none")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex space-x-2 sm:space-x-4 bg-transparent">
                        <textarea
                          ref={textareaRef}
                          value={input}
                          onChange={handleInputChange}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              formRef.current?.requestSubmit();
                            }
                          }}
                          rows={1}
                          placeholder="Type your message here..."
                          className="flex-1 p-2 sm:p-3 text-sm sm:text-base 
                            border border-gray-200 
                            rounded-md 
                            focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-300 
                            bg-transparent text-gray-800 
                            placeholder-gray-400
                            resize-none overflow-y-auto min-h-[40px] max-h-[160px]"
                        />
                        
                        <form ref={formRef} onSubmit={handleSubmitInput} className="space-y-2">
                          <button
                            type="submit"
                            disabled={isLoading || !input.trim()}
                            className={`bg-[#000000] text-white px-3 sm:px-4 py-2 rounded-md flex items-center space-x-1 sm:space-x-2 hover:bg-[#333333] transition-colors duration-300 ${
                              (!input.trim()) ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                          >
                            {isLoading ? (
                              <Loader className="h-5 w-5 animate-spin" />
                            ) : (
                              <>
                                <Send size={20} />
                                <span className="hidden sm:inline">Send</span>
                              </>
                            )}
                          </button>
                        </form>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showTooltip && hoveredCard && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.2 }}
          className="absolute bg-white rounded-lg p-4 shadow-xl z-50"
          style={{
            position: 'absolute',
            top: (getTargetCardRef(hoveredCard)?.current?.offsetTop || 0) + 50,
            left: (getTargetCardRef(hoveredCard)?.current?.offsetLeft || 0) + 50,
            width: '300px',
            height: '250px',
          }}
        >
          <div className="relative w-full h-full flex flex-col items-center justify-center">
            <button 
              onClick={() => setShowTooltip(false)}
              className="absolute top-2 right-2 text-gray-800 bg-gray-100 rounded-full p-1 z-10 hover:bg-gray-200"
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="text-gray-800 text-lg font-medium mb-2">
              {hoveredCard === "predesigned" ? "Brand-New Scenario" :
               hoveredCard === "brandnew" ? "Pre-designed Scenario" :
               hoveredCard === "customized" ? "Review Key Concepts" :
               "Customized Scenario"}
            </h3>
            <video 
              src={getVideoSource(hoveredCard === "predesigned" ? "brandnew" : 
                                  hoveredCard === "brandnew" ? "predesigned" :
                                  hoveredCard === "customized" ? "review" : "customized")}
              className="rounded-md w-full h-auto object-cover"
              autoPlay
              loop
              muted
            />
          </div>
        </motion.div>
      )}
    </div>
  )
}