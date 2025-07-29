import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();
  
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-purple-50 to-pink-50 p-4">
      <div className="text-center space-y-6 max-w-md">
        <h1 className="text-4xl font-bold text-gray-900">
          💕 App de Citas
        </h1>
        <p className="text-lg text-gray-600">
          Encuentra tu conexión perfecta
        </p>
        <Button 
          onClick={() => navigate("/registro")}
          className="bg-purple-600 hover:bg-purple-700"
        >
          Crear Perfil
        </Button>
      </div>
    </div>
  );
};

export default Index;
