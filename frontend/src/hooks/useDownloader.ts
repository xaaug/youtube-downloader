import { useState } from "react";
import { fetchMetadata } from "../api/youtube";
import { Metadata } from "../types/youtube";

export const useDownloader = () => {
  const [url, setUrl] = useState("");
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedQuality, setSelectedQuality] = useState("720p");
  const [selectedFormat, setSelectedFormat] = useState<"mp4" | "mp3">("mp4");

  const loadMetadata = async () => {
    if (!url) return;
    setFetching(true);
    setMetadata(null);
    setError(null);
    try {
      const data = await fetchMetadata(url);
      setMetadata(data);
      // Auto-select best quality
      if (data.formats?.length > 0) {
        setSelectedQuality(data.formats[0].quality);
      }
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setFetching(false);
    }
  };

  return {
    url,
    setUrl,
    metadata,
    fetching,
    error,
    selectedQuality,
    setSelectedQuality,
    selectedFormat,
    setSelectedFormat,
    loadMetadata,
  };
};