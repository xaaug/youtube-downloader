import { TextInput } from "@carbon/react";
import FetchDataButton from "./FetchDataButton.tsx";
import VideoPreview from "./VideoPreview.tsx";
import ResolutionSelect from "./ResolutionSelect.tsx";
import DownloadButton from "./DownloadButton.tsx";
import { useState } from "react";

const DownloadVideo: React.FC = () => {
  const [url, setUrl] = useState<string>(
    "https://www.youtube.com/watch?v=HYzDOLqw49E",
  );
  const [quality, setQuality] = useState<number>(0);
  const [resolutions, setResolutions] = useState<string[]>([]);
  const [fetching, setFetching] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [inputError, setInputError] = useState<boolean>(false);
  const [thumbnail, setThumbnail] = useState("");
  const [title, setTitle] = useState("");

  const fetchVideoInfo = async () => {
    if (!url) {
      setInputError(true);
      return;
    }

    // setLoading(true);
    setFetching(true);
    setInputError(false);

    try {
      const response = await fetch("http://127.0.0.1:5000/info", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();
      if (response.ok) {
        setTitle(data.title);
        setThumbnail(data.thumbnail);
        setResolutions(data.resolutions);
        setMessage("Video info fetched successfully.");
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch (error) {
      setMessage("An error occurred. Please try again.");
    } finally {
      // setLoading(false);
      setFetching(false);
    }
  };

  const isValidYouTubeUrl = (url: string) => {
    const regex =
      /^(https?:\/\/)?(www\.)?(youtube|youtu|youtube-nocookie)\.(com|be)\/(watch\?v=|embed\/|v\/|.+\/videos\/|playlist\?list=)[\w-]+(?:[&\?][\w=]+)*$/;
    return regex.test(url);
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isValidYouTubeUrl(e.target.value)) setInputError(true);

    setInputError(false);
    setUrl(e.target.value);
  };

  const setSelectedRes = (resolution: number) => {
    setQuality(resolution);
  };

  return (
    <>
      <div className="flex justify-center flex-col md:w-[70%] gap-2">
        <TextInput
          className="input-test-class"
          id="text-input-1"
          invalid={inputError}
          invalidText="Please input a valid Youtube link"
          labelText=""
          onChange={(e) => {
            handleInput(e);
          }}
          onClick={() => {}}
          placeholder="Paste Youtube video link"
          size="md"
          type="text"
          warnText="Please enter a valid URL"
        />
        <FetchDataButton fetchData={fetchVideoInfo} fetching={fetching} />

        <p
          className={`${message.includes("successfully") ? "text-[#24a148]" : "text-[#da1e28]"} text-xs mt-8`}
        >
          {message}
        </p>

        {thumbnail.length > 0 && (
          <VideoPreview thumbnail={thumbnail} title={title} />
        )}
        <div className="flex flex-col gap-2">
          {resolutions.length > 0 && (
            <div className="flex flex-col gap-4">
              <ResolutionSelect
                resolutions={resolutions}
                setSelectedRes={setSelectedRes}
              />

              <DownloadButton url={url} quality={quality} />
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default DownloadVideo;
