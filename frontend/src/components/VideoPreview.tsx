import {Tile} from "@carbon/react";

const VideoPreview: React.FC = () => {
  return (
    <>
      <div>


        <Tile>
          <div className="pb-4 flex flex-col gap-2">
            <img
                src="https://i9.ytimg.com/vi/ZMO9yC3AcIs/hq720_custom_1.jpg?sqp=CKiSyL0G-oaymwEnCNAFEJQDSFryq4qpAxkIARUAAIhCGAHYAQHiAQoIGBACGAY4AUAB&rs=AOn4CLAnSIL0yu6L7S7v_jSavmGCe6xWuw"
                alt="Youtube Thumbnail"
            />
          </div>
          <div className=" flex flex-col gap-2">
            <h4 className="font-mono text-base">
              High School Stories, Azanian Doll on Emtee, Nasty C vs A reece &
              More - Open Chats Podcast Epsd 98
            </h4>
          </div>
        </Tile>
      </div>
    </>
  );
};

export default VideoPreview;
