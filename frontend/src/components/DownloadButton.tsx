import {Button} from "@carbon/react";
import {useState} from "react";

interface Props {
    url: string;
    quality: number
}

const DownloadButton: React.FC<Props> = ({url, quality}) => {

    const [downloading, setDownloading] = useState<boolean>(false);
    const downloadVideo = () => {
        setDownloading(true)
        window.location.href = `http://localhost:5300/?url=${encodeURIComponent(url)}&action=download&format=mp4&quality=${quality}`;
    };







    return (
        <>
            <Button kind="secondary" onClick={downloadVideo}
                    disabled={downloading}>{downloading ? 'Downloading' : 'Download'}</Button>
        </>
    );
};

export default DownloadButton;
