import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import ImageUpload from "@/components/ImageUpload";
import { useAuth } from "@/hooks/useAuth";

const genderOptions = [
  { value: "hombre", label: "Hombre" },
  { value: "mujer", label: "Mujer" },
  { value: "no_binario", label: "No binario" },
  { value: "otro", label: "Otro" }
];

const orientationOptions = [
  { value: "heterosexual", label: "Heterosexual" },
  { value: "homosexual", label: "Homosexual" },
  { value: "bisexual", label: "Bisexual" },
  { value: "pansexual", label: "Pansexual" },
  { value: "asexual", label: "Asexual" },
  { value: "otro", label: "Otro" }
];

const lookingForOptions = [
  { value: "pareja", label: "Pareja" },
  { value: "amistad", label: "Amistad" },
  { value: "casual", label: "Casual" },
  { value: "red_social", label: "Red Social" }
];

const Register = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    age: 25,
    gender: "",
    orientation: "",
    lookingFor: "",
    description: "",
    minAgePreference: 18,
    maxAgePreference: 35,
    genderPreferences: [] as string[],
    images: [] as string[]
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.images.length < 3) {
      toast({
        title: "Fotos insuficientes",
        description: "Debes subir al menos 3 fotos para continuar",
        variant: "destructive"
      });
      return;
    }
    
    setLoading(true);

    try {
      if (!user) {
        toast({
          title: "Error",
          description: "Debes estar autenticado para completar tu perfil",
          variant: "destructive"
        });
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .insert({
          user_id: user.id,
          name: formData.name,
          age: formData.age,
          gender: formData.gender as any,
          orientation: formData.orientation as any,
          looking_for: formData.lookingFor as any,
          description: formData.description,
          min_age_preference: formData.minAgePreference,
          max_age_preference: formData.maxAgePreference,
          gender_preferences: formData.genderPreferences as any,
          image_urls: formData.images
        });

      if (error) {
        toast({
          title: "Error",
          description: "Error al crear el perfil: " + error.message,
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "¡Perfil creado!",
        description: "Tu perfil ha sido creado exitosamente"
      });

      navigate("/matches");
    } catch (error) {
      toast({
        title: "Error",
        description: "Error inesperado",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGenderPreferenceChange = (gender: string, checked: boolean) => {
    if (checked) {
      setFormData(prev => ({
        ...prev,
        genderPreferences: [...prev.genderPreferences, gender]
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        genderPreferences: prev.genderPreferences.filter(g => g !== gender)
      }));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-50 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Crear tu Perfil</h1>
          <Button 
            variant="outline" 
            onClick={signOut}
            className="text-sm"
          >
            Cerrar Sesión
          </Button>
        </div>
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold text-primary">
              Completa tu Perfil
            </CardTitle>
            <CardDescription>
              Cuéntanos sobre ti para encontrar las mejores conexiones
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Información Personal */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Información Personal</h3>
                
                <div>
                  <Label htmlFor="name">Nombre</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                    placeholder="Tu nombre"
                  />
                </div>

                <div>
                  <Label htmlFor="age">Edad: {formData.age} años</Label>
                  <Slider
                    value={[formData.age]}
                    onValueChange={([value]) => setFormData(prev => ({ ...prev, age: value }))}
                    min={18}
                    max={80}
                    step={1}
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label>Género</Label>
                  <RadioGroup
                    value={formData.gender}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, gender: value }))}
                    className="mt-2"
                  >
                    {genderOptions.map((option) => (
                      <div key={option.value} className="flex items-center space-x-2">
                        <RadioGroupItem value={option.value} id={`gender-${option.value}`} />
                        <Label htmlFor={`gender-${option.value}`}>{option.label}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                <div>
                  <Label>Orientación Sexual</Label>
                  <RadioGroup
                    value={formData.orientation}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, orientation: value }))}
                    className="mt-2"
                  >
                    {orientationOptions.map((option) => (
                      <div key={option.value} className="flex items-center space-x-2">
                        <RadioGroupItem value={option.value} id={`orientation-${option.value}`} />
                        <Label htmlFor={`orientation-${option.value}`}>{option.label}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                <div>
                  <Label>¿Qué buscas?</Label>
                  <RadioGroup
                    value={formData.lookingFor}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, lookingFor: value }))}
                    className="mt-2"
                  >
                    {lookingForOptions.map((option) => (
                      <div key={option.value} className="flex items-center space-x-2">
                        <RadioGroupItem value={option.value} id={`looking-${option.value}`} />
                        <Label htmlFor={`looking-${option.value}`}>{option.label}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                <div>
                  <Label htmlFor="description">Descripción breve</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Cuéntanos un poco sobre ti..."
                    className="mt-2"
                    rows={3}
                  />
                </div>
              </div>

              {/* Fotos de Perfil */}
              <ImageUpload
                images={formData.images}
                onImagesChange={(images) => setFormData(prev => ({ ...prev, images }))}
                maxImages={5}
                minImages={3}
              />

              {/* Preferencias de Match */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Preferencias de Match</h3>
                
                <div>
                  <Label>Rango de edad: {formData.minAgePreference} - {formData.maxAgePreference} años</Label>
                  <div className="mt-2 space-y-2">
                    <div>
                      <Label className="text-sm text-muted-foreground">Mínima: {formData.minAgePreference}</Label>
                      <Slider
                        value={[formData.minAgePreference]}
                        onValueChange={([value]) => setFormData(prev => ({ ...prev, minAgePreference: value }))}
                        min={18}
                        max={formData.maxAgePreference}
                        step={1}
                      />
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Máxima: {formData.maxAgePreference}</Label>
                      <Slider
                        value={[formData.maxAgePreference]}
                        onValueChange={([value]) => setFormData(prev => ({ ...prev, maxAgePreference: value }))}
                        min={formData.minAgePreference}
                        max={80}
                        step={1}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label>Géneros de interés</Label>
                  <div className="mt-2 space-y-2">
                    {genderOptions.map((option) => (
                      <div key={option.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`pref-${option.value}`}
                          checked={formData.genderPreferences.includes(option.value)}
                          onCheckedChange={(checked) => handleGenderPreferenceChange(option.value, checked as boolean)}
                        />
                        <Label htmlFor={`pref-${option.value}`}>{option.label}</Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creando perfil..." : "Completar Perfil"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Register;