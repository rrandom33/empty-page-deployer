import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Heart, Clock, MessageCircle, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface UserProfile {
  id: string;
  name: string;
  age: number;
  gender: "hombre" | "mujer" | "no_binario" | "otro";
  orientation: "heterosexual" | "homosexual" | "bisexual" | "pansexual" | "asexual" | "otro";
  lookingFor: "pareja" | "amistad" | "casual" | "red_social";
  minAge: number;
  maxAge: number;
  genderPreferences: string[];
  description?: string;
}

interface ActiveMatchCardProps {
  match: UserProfile;
  onStartChat: () => void;
  onDismiss: () => void;
}

const ActiveMatchCard = ({ match, onStartChat, onDismiss }: ActiveMatchCardProps) => {
  const navigate = useNavigate();
  const [timeUntilExpiry, setTimeUntilExpiry] = useState<number>(24 * 60 * 60 * 1000); // 24 horas
  const [matchCreatedAt] = useState<Date>(new Date()); // Simular cuando se creó el match

  // Calcular tiempo restante hasta que expire el match
  useEffect(() => {
    const interval = setInterval(() => {
      const timeSinceMatch = Date.now() - matchCreatedAt.getTime();
      const matchDuration = 24 * 60 * 60 * 1000; // 24 horas
      const remaining = matchDuration - timeSinceMatch;
      
      if (remaining <= 0) {
        // Match expirado
        onDismiss();
        return;
      }
      
      setTimeUntilExpiry(remaining);
    }, 1000); // Actualizar cada segundo

    return () => clearInterval(interval);
  }, [matchCreatedAt, onDismiss]);

  const formatTimeRemaining = (milliseconds: number): string => {
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  };

  const handleStartChat = () => {
    navigate(`/chat/${match.id}`);
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const getDescription = () => {
    return match.description || `Hola! Soy ${match.name}, me encanta conocer gente nueva y compartir buenas conversaciones. ¡Espero que podamos conocernos mejor!`;
  };

  return (
    <Card className="overflow-hidden">
      {/* Temporizador de expiración */}
      <div className="bg-gradient-to-r from-pink-500 to-purple-600 p-4 text-white text-center">
        <div className="flex items-center justify-center space-x-2">
          <Clock className="h-5 w-5" />
          <span className="font-semibold">
            Tiempo para iniciar conversación: {formatTimeRemaining(timeUntilExpiry)}
          </span>
        </div>
      </div>

      <CardHeader className="text-center pb-4">
        <div className="flex items-center justify-center space-x-2 mb-4">
          <Heart className="h-6 w-6 text-red-500" />
          <CardTitle className="text-xl">¡Nuevo Match!</CardTitle>
          <Heart className="h-6 w-6 text-red-500" />
        </div>
        <CardDescription>
          Tienes 24 horas para iniciar la conversación
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Foto de perfil y información básica */}
        <div className="text-center space-y-4">
          <Avatar className="h-24 w-24 mx-auto">
            <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${match.name}`} />
            <AvatarFallback className="text-2xl bg-gradient-to-br from-purple-100 to-pink-100">
              {getInitials(match.name)}
            </AvatarFallback>
          </Avatar>
          
          <div>
            <h3 className="text-2xl font-bold text-purple-600">{match.name}</h3>
            <p className="text-gray-600">{match.age} años</p>
          </div>
        </div>

        {/* Descripción */}
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-gray-700 text-center italic">
            "{getDescription()}"
          </p>
        </div>
        
        {/* Badges de información */}
        <div className="flex flex-wrap gap-2 justify-center">
          <Badge variant="secondary">{match.gender}</Badge>
          <Badge variant="secondary">{match.orientation}</Badge>
          <Badge variant="secondary">Busca: {match.lookingFor}</Badge>
        </div>

        <div className="text-center space-y-2">
          <p className="text-sm text-gray-600">
            Rango de edad que busca: {match.minAge} - {match.maxAge} años
          </p>
        </div>

        {/* Botones de acción */}
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={onDismiss}
          >
            <X className="h-4 w-4 mr-2" />
            Pasar
          </Button>
          <Button 
            className="flex-1 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700"
            onClick={handleStartChat}
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            Iniciar Chat
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ActiveMatchCard;