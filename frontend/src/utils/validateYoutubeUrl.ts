export const isValidYouTubeUrl = (url: string): boolean => {
    try {
      const u = new URL(url);
      return (
        (u.hostname.includes("youtube.com") ||
          u.hostname.includes("youtu.be")) &&
        (u.searchParams.has("v") ||
          u.hostname.includes("youtu.be") ||
          u.searchParams.has("list"))
      );
    } catch {
      return false;
    }
  };