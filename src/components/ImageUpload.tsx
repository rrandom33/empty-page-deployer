import React, { useState, useCallback } from "react";
import { Upload, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ImageUploadProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  maxImages?: number;
  minImages?: number;
}

const ImageUpload: React.FC<ImageUploadProps> = ({
  images,
  onImagesChange,
  maxImages = 5,
  minImages = 3
}) => {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const uploadImage = useCallback(async (file: File): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado");

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('profile-images')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('profile-images')
        .getPublicUrl(fileName);

      return data.publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      return null;
    }
  }, []);

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    
    if (files.length + images.length > maxImages) {
      toast({
        title: "Demasiadas imágenes",
        description: `Solo puedes subir máximo ${maxImages} imágenes`,
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    const newImages: string[] = [];

    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "Archivo muy grande",
          description: "Las imágenes no pueden superar los 5MB",
          variant: "destructive"
        });
        continue;
      }

      const imageUrl = await uploadImage(file);
      if (imageUrl) {
        newImages.push(imageUrl);
      }
    }

    if (newImages.length > 0) {
      onImagesChange([...images, ...newImages]);
      toast({
        title: "Imágenes subidas",
        description: `${newImages.length} imagen(es) subida(s) exitosamente`
      });
    }

    setUploading(false);
    // Reset input
    event.target.value = '';
  }, [images, maxImages, onImagesChange, uploadImage, toast]);

  const removeImage = useCallback(async (index: number) => {
    const imageUrl = images[index];
    
    try {
      // Extract file path from URL
      const url = new URL(imageUrl);
      const filePath = url.pathname.split('/').slice(-2).join('/');
      
      await supabase.storage
        .from('profile-images')
        .remove([filePath]);
    } catch (error) {
      console.error('Error removing image:', error);
    }

    const newImages = images.filter((_, i) => i !== index);
    onImagesChange(newImages);
  }, [images, onImagesChange]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          Fotos de perfil ({images.length}/{maxImages})
        </h3>
        <span className="text-sm text-muted-foreground">
          Mínimo {minImages} fotos requeridas
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {images.map((image, index) => (
          <Card key={index} className="relative aspect-square overflow-hidden group">
            <img
              src={image}
              alt={`Foto ${index + 1}`}
              className="w-full h-full object-cover"
            />
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6"
              onClick={() => removeImage(index)}
            >
              <X className="w-4 h-4" />
            </Button>
          </Card>
        ))}

        {images.length < maxImages && (
          <Card className="aspect-square border-dashed border-2 border-muted-foreground/25 hover:border-muted-foreground/50 transition-colors">
            <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                disabled={uploading}
              />
              {uploading ? (
                <div className="flex flex-col items-center text-muted-foreground">
                  <Upload className="w-8 h-8 mb-2 animate-pulse" />
                  <span className="text-sm">Subiendo...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center text-muted-foreground hover:text-foreground transition-colors">
                  <Plus className="w-8 h-8 mb-2" />
                  <span className="text-sm text-center px-2">
                    Agregar foto
                  </span>
                </div>
              )}
            </label>
          </Card>
        )}
      </div>

      {images.length < minImages && (
        <p className="text-sm text-destructive">
          Necesitas subir al menos {minImages} fotos para continuar
        </p>
      )}
    </div>
  );
};

export default ImageUpload;