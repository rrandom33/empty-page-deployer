import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heart, Clock, Users, Calendar } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

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
  lastMatchDate?: Date;
}

// Datos simulados de usuarios
const simulatedUsers: UserProfile[] = [
  {
    id: "user1",
    name: "María",
    age: 25,
    gender: "mujer",
    orientation: "heterosexual",
    lookingFor: "pareja",
    minAge: 23,
    maxAge: 35,
    genderPreferences: ["hombre"]
  },
  {
    id: "user2", 
    name: "Carlos",
    age: 28,
    gender: "hombre",
    orientation: "heterosexual",
    lookingFor: "pareja",
    minAge: 22,
    maxAge: 30,
    genderPreferences: ["mujer"]
  },
  {
    id: "user3",
    name: "Ana",
    age: 30,
    gender: "mujer",
    orientation: "bisexual",
    lookingFor: "amistad",
    minAge: 25,
    maxAge: 40,
    genderPreferences: ["mujer", "hombre", "no_binario"]
  },
  {
    id: "user4",
    name: "Jorge",
    age: 35,
    gender: "hombre",
    orientation: "homosexual",
    lookingFor: "pareja",
    minAge: 30,
    maxAge: 45,
    genderPreferences: ["hombre"]
  },
  {
    id: "user5",
    name: "Sam",
    age: 27,
    gender: "no_binario",
    orientation: "pansexual",
    lookingFor: "casual",
    minAge: 22,
    maxAge: 35,
    genderPreferences: ["mujer", "hombre", "no_binario", "otro"]
  },
  {
    id: "user6",
    name: "Laura",
    age: 26,
    gender: "mujer",
    orientation: "homosexual",
    lookingFor: "pareja",
    minAge: 24,
    maxAge: 32,
    genderPreferences: ["mujer"]
  },
  {
    id: "user7",
    name: "Diego",
    age: 29,
    gender: "hombre",
    orientation: "heterosexual",
    lookingFor: "amistad",
    minAge: 25,
    maxAge: 35,
    genderPreferences: ["mujer", "hombre"]
  },
  {
    id: "user8",
    name: "Alex",
    age: 24,
    gender: "hombre",
    orientation: "homosexual",
    lookingFor: "pareja",
    minAge: 22,
    maxAge: 40,
    genderPreferences: ["hombre"]
  }
];

const MatchScreen = () => {
  const { user } = useAuth();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [currentMatch, setCurrentMatch] = useState<UserProfile | null>(null);
  const [timeUntilNextMatch, setTimeUntilNextMatch] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);

  // Simular el perfil del usuario actual (normalmente vendría de la base de datos)
  useEffect(() => {
    if (user) {
      // Por ahora usamos el primer usuario como ejemplo del usuario actual
      const mockCurrentUser: UserProfile = {
        id: user.id,
        name: "Usuario Actual",
        age: 26,
        gender: "mujer",
        orientation: "heterosexual", 
        lookingFor: "pareja",
        minAge: 24,
        maxAge: 35,
        genderPreferences: ["hombre"],
        lastMatchDate: new Date(Date.now() - (2 * 24 * 60 * 60 * 1000)) // Último match hace 2 días
      };
      setCurrentUser(mockCurrentUser);
    }
  }, [user]);

  // Función para verificar compatibilidad entre dos usuarios
  const areCompatible = (user1: UserProfile, user2: UserProfile): boolean => {
    // Verificar que la edad de cada uno esté en el rango del otro
    const ageCompatible = 
      user1.age >= user2.minAge && 
      user1.age <= user2.maxAge &&
      user2.age >= user1.minAge && 
      user2.age <= user1.maxAge;

    // Verificar que el género de cada uno esté en las preferencias del otro
    const genderCompatible = 
      user1.genderPreferences.includes(user2.gender) &&
      user2.genderPreferences.includes(user1.gender);

    // Verificar que busquen lo mismo
    const lookingForCompatible = user1.lookingFor === user2.lookingFor;

    return ageCompatible && genderCompatible && lookingForCompatible;
  };

  // Función para encontrar matches compatibles
  const findCompatibleMatches = (currentUser: UserProfile): UserProfile[] => {
    return simulatedUsers.filter(otherUser => 
      otherUser.id !== currentUser.id && areCompatible(currentUser, otherUser)
    );
  };

  // Función para calcular tiempo hasta el próximo match
  const calculateTimeUntilNextMatch = (lastMatchDate?: Date): number => {
    if (!lastMatchDate) return 0;
    
    const timeSinceLastMatch = Date.now() - lastMatchDate.getTime();
    const matchCooldown = 72 * 60 * 60 * 1000; // 72 horas en milisegundos
    const timeRemaining = matchCooldown - timeSinceLastMatch;
    
    return Math.max(0, timeRemaining);
  };

  // Función para formatear tiempo restante
  const formatTimeRemaining = (milliseconds: number): string => {
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Función para buscar un nuevo match
  const searchForMatch = () => {
    if (!currentUser) return;

    setIsLoading(true);
    
    // Simular tiempo de búsqueda
    setTimeout(() => {
      const compatibleUsers = findCompatibleMatches(currentUser);
      
      if (compatibleUsers.length > 0) {
        // Elegir uno aleatoriamente
        const randomIndex = Math.floor(Math.random() * compatibleUsers.length);
        const selectedMatch = compatibleUsers[randomIndex];
        
        setCurrentMatch(selectedMatch);
        
        // Actualizar la fecha del último match
        const updatedUser = { ...currentUser, lastMatchDate: new Date() };
        setCurrentUser(updatedUser);
      } else {
        setCurrentMatch(null);
      }
      
      setIsLoading(false);
    }, 1500);
  };

  // Actualizar temporizador cada minuto
  useEffect(() => {
    const interval = setInterval(() => {
      if (currentUser?.lastMatchDate) {
        const remaining = calculateTimeUntilNextMatch(currentUser.lastMatchDate);
        setTimeUntilNextMatch(remaining);
      }
    }, 60000); // Actualizar cada minuto

    // Calcular tiempo inicial
    if (currentUser?.lastMatchDate) {
      const remaining = calculateTimeUntilNextMatch(currentUser.lastMatchDate);
      setTimeUntilNextMatch(remaining);
    }

    return () => clearInterval(interval);
  }, [currentUser]);

  const canSearchForMatch = timeUntilNextMatch === 0;

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-pink-50">
        <div className="text-center">
          <p>Cargando perfil...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            💕 Encuentra tu Match
          </h1>
          <p className="text-gray-600">
            Recibe un nuevo match cada 72 horas
          </p>
        </div>

        {/* Estado del temporizador */}
        {!canSearchForMatch && (
          <Card>
            <CardContent className="flex items-center justify-center p-6">
              <div className="text-center space-y-2">
                <Clock className="h-12 w-12 mx-auto text-purple-600" />
                <h3 className="text-lg font-semibold">Próximo match disponible en:</h3>
                <div className="text-2xl font-bold text-purple-600">
                  {formatTimeRemaining(timeUntilNextMatch)}
                </div>
                <p className="text-sm text-gray-600">
                  Mientras tanto, puedes actualizar tu perfil
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Botón de búsqueda */}
        {canSearchForMatch && (
          <Card>
            <CardContent className="flex items-center justify-center p-6">
              <div className="text-center space-y-4">
                <Users className="h-12 w-12 mx-auto text-green-600" />
                <h3 className="text-lg font-semibold">¡Es hora de un nuevo match!</h3>
                <Button 
                  onClick={searchForMatch}
                  disabled={isLoading}
                  className="bg-purple-600 hover:bg-purple-700"
                  size="lg"
                >
                  {isLoading ? "Buscando..." : "Buscar Match"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Resultado del match */}
        {!isLoading && canSearchForMatch && currentMatch && (
          <Card>
            <CardHeader className="text-center">
              <div className="flex items-center justify-center space-x-2 mb-2">
                <Heart className="h-6 w-6 text-red-500" />
                <CardTitle className="text-xl">¡Tienes un nuevo match!</CardTitle>
                <Heart className="h-6 w-6 text-red-500" />
              </div>
              <CardDescription>
                Hemos encontrado a alguien compatible contigo
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <h3 className="text-2xl font-bold text-purple-600">{currentMatch.name}</h3>
                <p className="text-gray-600">{currentMatch.age} años</p>
              </div>
              
              <div className="flex flex-wrap gap-2 justify-center">
                <Badge variant="secondary">{currentMatch.gender}</Badge>
                <Badge variant="secondary">{currentMatch.orientation}</Badge>
                <Badge variant="secondary">Busca: {currentMatch.lookingFor}</Badge>
              </div>

              <div className="text-center space-y-2">
                <p className="text-sm text-gray-600">
                  Rango de edad que busca: {currentMatch.minAge} - {currentMatch.maxAge} años
                </p>
              </div>

              <div className="flex gap-2 justify-center">
                <Button variant="outline" className="flex-1">
                  Pasar
                </Button>
                <Button className="flex-1 bg-purple-600 hover:bg-purple-700">
                  Me gusta ❤️
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* No hay matches compatibles */}
        {!isLoading && canSearchForMatch && currentMatch === null && currentUser.lastMatchDate && (
          <Card>
            <CardContent className="flex items-center justify-center p-6">
              <div className="text-center space-y-2">
                <Calendar className="h-12 w-12 mx-auto text-gray-400" />
                <h3 className="text-lg font-semibold">No hay matches por ahora</h3>
                <p className="text-gray-600">
                  No hemos encontrado a nadie compatible por ahora.
                  <br />
                  Volveremos a intentarlo en breve.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Información de tu perfil */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Tu perfil de búsqueda</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{currentUser.gender}</Badge>
              <Badge variant="outline">{currentUser.orientation}</Badge>
              <Badge variant="outline">Busca: {currentUser.lookingFor}</Badge>
            </div>
            <p className="text-sm text-gray-600">
              Buscas personas de {currentUser.minAge} a {currentUser.maxAge} años
            </p>
            <p className="text-sm text-gray-600">
              Géneros de interés: {currentUser.genderPreferences.join(", ")}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MatchScreen;