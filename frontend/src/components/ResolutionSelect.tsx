import { Dropdown } from "@carbon/react";

const resolutions = [
  { id: "144p", label: "144p" },
  { id: "240p", label: "240p" },
  { id: "360p", label: "360p" },
  { id: "480p", label: "480p" },
  { id: "720p", label: "720p (HD)" },
  { id: "1080p", label: "1080p (Full HD)" },
  { id: "1440p", label: "1440p (2K)" },
  { id: "2160p", label: "2160p (4K)" },
];

const ResolutionSelect: React.FC = () => {
  return (
    <>
      <div>
        <Dropdown
          id="default"
          invalidText="invalid selection"
          titleText=""
          items={resolutions}
          label="Select Resolution"
          type="default"
          warnText="please notice the warning"
        />
      </div>
    </>
  );
};

export default ResolutionSelect;
