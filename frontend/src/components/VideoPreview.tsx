import { Tile } from "@carbon/react";

interface MetaData {
  title: string;
  thumbnail: string;
  duration: number;
}

interface Props {
  metaData?: MetaData;
  thumbnail: string;
  title: string;
}

const VideoPreview: React.FC<Props> = ({ thumbnail, title }) => {
  return (
    <>
      <div>
        <Tile>
          <div className="pb-4 flex flex-col gap-2">
            <img src={thumbnail} />
          </div>
          <div className=" flex flex-col gap-2">
            <h4 className="font-mono text-base">{title}</h4>
          </div>
        </Tile>
      </div>
    </>
  );
};

export default VideoPreview;
