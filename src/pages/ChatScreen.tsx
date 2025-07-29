import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Clock, Send, Heart, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface Message {
  id: string;
  senderId: string;
  content: string;
  timestamp: Date;
}

interface UserProfile {
  id: string;
  name: string;
  age: number;
  gender: string;
  orientation: string;
  lookingFor: string;
}

// Datos simulados - normalmente vendrían de la base de datos
const simulatedUser: UserProfile = {
  id: "user2",
  name: "Carlos",
  age: 28,
  gender: "hombre",
  orientation: "heterosexual",
  lookingFor: "pareja"
};

const ChatScreen = () => {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [chatStartTime] = useState<Date>(new Date());
  const [timeRemaining, setTimeRemaining] = useState<number>(24 * 60 * 60 * 1000); // 24 horas
  const [showDecisionPrompt, setShowDecisionPrompt] = useState(false);
  const [userDecision, setUserDecision] = useState<"continue" | "pass" | null>(null);
  const [matchDecision, setMatchDecision] = useState<"continue" | "pass" | null>(null);
  const [chatEnded, setChatEnded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll a los mensajes más recientes
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  // Temporizador de chat
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - chatStartTime.getTime();
      const chatDuration = 24 * 60 * 60 * 1000; // 24 horas
      const remaining = chatDuration - elapsed;
      
      if (remaining <= 0) {
        // Tiempo agotado
        if (!userDecision || !matchDecision) {
          setChatEnded(true);
        }
        return;
      }
      
      setTimeRemaining(remaining);
      
      // Mostrar prompt de decisión cuando queden 2 horas
      if (remaining <= 2 * 60 * 60 * 1000 && !showDecisionPrompt) {
        setShowDecisionPrompt(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [chatStartTime, userDecision, matchDecision, showDecisionPrompt]);

  // Simular respuestas automáticas del match
  useEffect(() => {
    if (messages.length === 1 && messages[0].senderId === user?.id) {
      // Primera respuesta automática
      setTimeout(() => {
        const autoReply: Message = {
          id: Date.now().toString(),
          senderId: matchId!,
          content: "¡Hola! Me alegra mucho que hayamos hecho match 😊",
          timestamp: new Date()
        };
        setMessages(prev => [...prev, autoReply]);
      }, 2000);
    } else if (messages.length > 1 && messages[messages.length - 1].senderId === user?.id) {
      // Respuestas adicionales simuladas
      const responses = [
        "¡Qué interesante! Cuéntame más 😄",
        "Me parece genial, yo también pienso así",
        "¿En serio? ¡Eso es increíble!",
        "Jajaja, tienes muy buen sentido del humor",
        "Me gusta tu forma de pensar 💭"
      ];
      
      setTimeout(() => {
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        const autoReply: Message = {
          id: Date.now().toString(),
          senderId: matchId!,
          content: randomResponse,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, autoReply]);
      }, 1500 + Math.random() * 2000);
    }
  }, [messages, user?.id, matchId]);

  // Simular decisión del match
  useEffect(() => {
    if (showDecisionPrompt && !matchDecision) {
      setTimeout(() => {
        // Simular que el match decide continuar 70% del tiempo
        const decision = Math.random() > 0.3 ? "continue" : "pass";
        setMatchDecision(decision);
      }, 3000 + Math.random() * 5000);
    }
  }, [showDecisionPrompt, matchDecision]);

  const formatTimeRemaining = (milliseconds: number): string => {
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const sendMessage = () => {
    if (!newMessage.trim() || chatEnded) return;

    const message: Message = {
      id: Date.now().toString(),
      senderId: user?.id || "",
      content: newMessage.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, message]);
    setNewMessage("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleUserDecision = (decision: "continue" | "pass") => {
    setUserDecision(decision);
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  // Determinar el resultado final
  const getFinalResult = () => {
    if (!userDecision || !matchDecision) return null;
    
    if (userDecision === "continue" && matchDecision === "continue") {
      return "both_continue";
    } else {
      return "chat_ended";
    }
  };

  const finalResult = getFinalResult();

  if (chatEnded || finalResult === "chat_ended") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-4">
        <div className="max-w-md mx-auto">
          <Card className="text-center">
            <CardContent className="p-8">
              <X className="h-16 w-16 mx-auto text-gray-400 mb-4" />
              <h2 className="text-xl font-semibold mb-4">Chat Finalizado</h2>
              <p className="text-gray-600 mb-6">
                {timeRemaining <= 0 
                  ? "El tiempo de chat ha expirado"
                  : "Uno de ustedes decidió no continuar"
                }
              </p>
              <Button onClick={() => navigate("/matches")} className="w-full">
                Volver a Matches
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (finalResult === "both_continue") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-4">
        <div className="max-w-md mx-auto">
          <Card className="text-center">
            <CardContent className="p-8">
              <Heart className="h-16 w-16 mx-auto text-red-500 mb-4" />
              <h2 className="text-xl font-semibold mb-4">¡Felicidades! 🎉</h2>
              <p className="text-gray-600 mb-6">
                Ambos decidieron continuar. ¡El chat ahora es permanente!
              </p>
              <Button onClick={() => navigate("/matches")} className="w-full">
                Continuar Chateando
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-md mx-auto px-4 py-3">
          <div className="flex items-center space-x-3">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => navigate("/matches")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            
            <Avatar className="h-10 w-10">
              <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${simulatedUser.name}`} />
              <AvatarFallback>{getInitials(simulatedUser.name)}</AvatarFallback>
            </Avatar>
            
            <div className="flex-1">
              <h3 className="font-semibold">{simulatedUser.name}</h3>
              <p className="text-xs text-gray-500">{simulatedUser.age} años</p>
            </div>
            
            <div className="text-right">
              <div className="flex items-center space-x-1 text-xs text-purple-600">
                <Clock className="h-3 w-3" />
                <span>{formatTimeRemaining(timeRemaining)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Prompt de decisión */}
      {showDecisionPrompt && !userDecision && (
        <div className="max-w-md mx-auto p-4">
          <Card className="bg-yellow-50 border-yellow-200">
            <CardContent className="p-4">
              <h4 className="font-semibold mb-2">¡Tiempo casi agotado!</h4>
              <p className="text-sm text-gray-600 mb-4">
                ¿Quieres seguir hablando con {simulatedUser.name}?
              </p>
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleUserDecision("pass")}
                  className="flex-1"
                >
                  No gracias
                </Button>
                <Button 
                  size="sm"
                  onClick={() => handleUserDecision("continue")}
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                >
                  ¡Sí, continuar!
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Estado de decisiones */}
      {userDecision && (
        <div className="max-w-md mx-auto p-4">
          <Card>
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Tu decisión:</span>
                  <Badge variant={userDecision === "continue" ? "default" : "secondary"}>
                    {userDecision === "continue" ? "Continuar" : "No continuar"}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>Decisión de {simulatedUser.name}:</span>
                  {matchDecision ? (
                    <Badge variant={matchDecision === "continue" ? "default" : "secondary"}>
                      {matchDecision === "continue" ? "Continuar" : "No continuar"}
                    </Badge>
                  ) : (
                    <span className="text-sm text-gray-500">Esperando...</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Área de mensajes */}
      <div className="max-w-md mx-auto h-[calc(100vh-200px)] flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.senderId === user?.id ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                  message.senderId === user?.id
                    ? "bg-purple-600 text-white"
                    : "bg-white text-gray-800 border"
                }`}
              >
                <p className="text-sm">{message.content}</p>
                <p className={`text-xs mt-1 ${
                  message.senderId === user?.id ? "text-purple-200" : "text-gray-500"
                }`}>
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input de mensaje */}
        <div className="p-4 bg-white border-t">
          <div className="flex space-x-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Escribe un mensaje..."
              disabled={chatEnded}
              className="flex-1"
            />
            <Button
              onClick={sendMessage}
              disabled={!newMessage.trim() || chatEnded}
              size="sm"
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatScreen;