import { TextInput } from "@carbon/react";
import FetchDataButton from "./FetchDataButton.tsx";
import VideoPreview from "./VideoPreview.tsx";
import ResolutionSelect from "./ResolutionSelect.tsx";
import DownloadButton from "./DownloadButton.tsx";

const DownloadVideo: React.FC = () => {
  return (
    <>
      <div className="flex justify-center flex-col md:w-[70%] gap-2">
        <TextInput
          className="input-test-class"
          id="text-input-1"
          invalidText="Please input a valid Youtube link"
          labelText=""
          onChange={() => {}}
          onClick={() => {}}
          placeholder="Paste Youtube video link"
          size="md"
          type="text"
          warnText="Please enter a valid URL"
        />
        <FetchDataButton />
        <VideoPreview />
        <div className="flex flex-col gap-2">
          <ResolutionSelect />
          <DownloadButton />
        </div>
      </div>
    </>
  );
};

export default DownloadVideo;
