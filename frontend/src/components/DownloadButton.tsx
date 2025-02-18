import { Button } from "@carbon/react";
import { useState } from "react";

interface Props {
  url: string;
  quality: number;
}

const DownloadButton: React.FC<Props> = ({ url, quality }) => {
  const [downloading, setDownloading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [filename, setFilename] = useState("");

  const handleDownload = async () => {
    setDownloading(true);
    setMessage("");

    try {
      const response = await fetch("http://127.0.0.1:5000/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, resolution: quality }),
      });

      const data = await response.json();
      if (response.ok) {
        setMessage(`Downloaded: ${data.title}`);
        setFilename(data.filename);
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch (error) {
      setMessage("An error occurred. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

    const handleStream = () => {
        if (filename) {
            // Open the file in a new tab for streaming
            window.open(`http://127.0.0.1:5000/stream/${filename}`, "_blank");
            setMessage('Video Saved')

            // Delay deletion to allow streaming
            setTimeout(async () => {
                try {
                    const response = await fetch(`http://127.0.0.1:5000/delete/${filename}`, {
                        method: 'DELETE',
                    });

                    if (response.ok) {
                        setMessage('Video Saved');
                        setFilename(''); // Clear the filename after deletion
                    } else {
                        setMessage('');
                    }
                } catch (error) {
                    setMessage('');
                }
            }, 60000); // Wait 60 seconds before attempting to delete
        }
    };


    return (
    <>
      <div className="flex gap-4">
        <Button
          kind="secondary"
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? "Downloading" : "Download"}
        </Button>
          {filename.length > 0 &&
              <Button kind="secondary" onClick={handleStream}>
                  Save to device
              </Button>}
      </div>
      <p
        className={
          (message.includes("Downloaded") || message.includes('Saved')) ? "text-[#24a148]" : "text-[#da1e28]"
        }
      >
        {message}
      </p>
    </>
  );
};

export default DownloadButton;
