import { useState, useEffect } from "react";
import { getItem } from "../config/db";

// --- Custom Hook to load local images ---
export const useLocalImage = (imageId) => {
  const [imageUrl, setImageUrl] = useState(null);

  useEffect(() => {
    let objectUrl = null;
    if (!imageId) {
      setImageUrl(null);
      return;
    }

    // Direct HTTP(S) link or base64 data URI (from Google Drive or Cloud)
    if (typeof imageId === "string" && (imageId.startsWith("http://") || imageId.startsWith("https://") || imageId.startsWith("data:"))) {
      setImageUrl(imageId);
      return;
    }

    getItem("trade_images", imageId)
      .then((imageRecord) => {
        if (imageRecord && imageRecord.file) {
          objectUrl = URL.createObjectURL(imageRecord.file);
          setImageUrl(objectUrl);
        } else if (imageRecord && imageRecord.base64) {
          setImageUrl(imageRecord.base64);
        } else if (typeof imageId === "string" && /^[a-zA-Z0-9_-]{25,45}$/.test(imageId)) {
          // Fallback Google Drive direct file ID
          setImageUrl(`https://lh3.googleusercontent.com/d/${imageId}`);
        } else {
          setImageUrl(null);
        }
      })
      .catch((err) => {
        console.error("Failed to load image from DB", err);
        // Fallback if it looks like a Google Drive file ID
        if (typeof imageId === "string" && /^[a-zA-Z0-9_-]{25,45}$/.test(imageId)) {
          setImageUrl(`https://lh3.googleusercontent.com/d/${imageId}`);
        } else {
          setImageUrl(null);
        }
      });

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [imageId]);

  return imageUrl;
};

export default useLocalImage;
