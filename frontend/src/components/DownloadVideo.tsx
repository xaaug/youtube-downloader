import {TextInput} from "@carbon/react";
import FetchDataButton from "./FetchDataButton.tsx";
import VideoPreview from "./VideoPreview.tsx";
import ResolutionSelect from "./ResolutionSelect.tsx";
import DownloadButton from "./DownloadButton.tsx";
import {useState} from "react";

interface Format {
    format_id: string
    resolution?: string
    extension: string
}

interface MetaData {
    title: string
    thumbnail: string
    duration: number
    formats: Format[]
}

const DownloadVideo: React.FC = () => {

    const [metaData, setMetaData] = useState<MetaData>({})
    const [url, setUrl] = useState<string>("https://www.youtube.com/watch?v=HYzDOLqw49E");
    const [quality, setQuality] = useState<number>(0);
    const [resolutions, setResolutions] = useState<Format[]>([])
    const [fetching, setFetching] = useState<boolean>(false);
    const [inputError, setInputError] = useState<boolean>(false);


    const fetchData = async () => {
        setFetching(true);
        const response = await fetch(`http://localhost:5300/?url=${encodeURIComponent(url)}&action=metadata`)
        const data = await response.json()


        console.log(data)
        setMetaData(data)
        setFetching(false);
        setResolutions(data.formats.filter((format: Format) => (Object.keys(format).includes('resolution') && format.resolution !== 'Default'&& format.extension === 'mp4')))
    }

    const isValidYouTubeUrl = (url: string) => {
        const regex = /^(https?:\/\/)?(www\.)?(youtube|youtu|youtube-nocookie)\.(com|be)\/(watch\?v=|embed\/|v\/|.+\/videos\/|playlist\?list=)[\w-]+(?:[&\?][\w=]+)*$/;
        return regex.test(url);
    };

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        console.log(e.target.value)
        if(!isValidYouTubeUrl(e.target.value)) setInputError(true);

        setInputError(false);
        setUrl(e.target.value)
    }

    const setSelectedRes = (resolution: number) => {
        setQuality(resolution)
    }

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
                        handleInput(e)
                    }}
                    onClick={() => {
                    }}
                    placeholder="Paste Youtube video link"
                    size="md"
                    type="text"
                    warnText="Please enter a valid URL"

                />
                <FetchDataButton fetchData={fetchData} fetching={fetching}/>
                {Object.entries(metaData).length > 0 && <VideoPreview metaData={metaData}/>}
                <div className="flex flex-col gap-2">

                    {resolutions.length > 0 && <div className='flex flex-col gap-4'>
                        <ResolutionSelect resolutions={resolutions} setSelectedRes={setSelectedRes}/>

                        <DownloadButton url={url} quality={quality}/>
                    </div>}
                </div>
            </div>
        </>
    );
};

export default DownloadVideo;
