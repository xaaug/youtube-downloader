export interface Format {
    format_id: string;
    quality: string;
    height: number;
    ext: string;
    filesize: number | null;
  }
  
  export interface PlaylistEntry {
    id: string;
    title: string;
    url: string;
    thumbnail: string;
    duration: number | null;
  }
  
  export interface VideoMetadata {
    title: string;
    thumbnail: string;
    duration: number;
    uploader: string | null;
    view_count: number | null;
    formats: Format[];
    is_playlist: false;
  }
  
  export interface PlaylistMetadata {
    title: string;
    thumbnail: string | null;
    uploader: string | null;
    count: number;
    entries: PlaylistEntry[];
    formats: Format[];
    is_playlist: true;
  }
  
  export type Metadata = VideoMetadata | PlaylistMetadata;