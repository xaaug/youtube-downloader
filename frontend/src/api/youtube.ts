const BASE = import.meta.env.VITE_API_URL || "http://localhost:5300";

export const fetchMetadata = async (url: string) => {
  const res = await fetch(
    `${BASE}/?action=metadata&url=${encodeURIComponent(url)}`
  );
  if (!res.ok) throw new Error("Failed to fetch metadata");
  return res.json();
};

export const getDownloadUrl = (
  url: string,
  quality: string,
  format: "mp4" | "mp3"
) =>
  `${BASE}/?action=download&url=${encodeURIComponent(url)}&quality=${quality}&format=${format}`;